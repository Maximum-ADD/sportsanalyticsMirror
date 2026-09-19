import { HttpStatus, Injectable } from "@nestjs/common";
import type { EventCorrection, GameEvent, Prisma } from "@prisma/client";
import { ApiException } from "../common/api-exception.js";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ResponseCacheService } from "../cache/response-cache.service.js";
import { buildGameRoster, resolveSecondaryPlayer, type CountingStatField } from "./derive-player-game-stats.js";
import {
  CORRECTABLE_FIELDS,
  type CorrectableField,
  type CorrectionRequest,
} from "./event-correction-request.js";
import {
  creditStatFor,
  hasInapplicableCreditSuffix,
  rewriteCreditSuffix,
  stripCreditSuffixes,
  validateCorrectedEvent,
  type CorrectableEvent,
  type CreditRewriteResult,
} from "./event-correction-rules.js";
import {
  buildNamesByPlayerId,
  loadGameSnapshot,
  resolveGameTeamByPlayerId,
  type GameSnapshot,
} from "./game-snapshot.js";
import { planStatRecompute, type PlayerStatRecompute } from "./plan-stat-recompute.js";

// One row from the corrections list, joined with the game and user so the
// admin UI can show which game was corrected and by whom without extra
// round trips.
export interface CorrectionWithDetails extends EventCorrection {
  game: { id: string; gameDate: Date; season: string; nbaGameId: string };
  correctedBy: { id: string; name: string } | null;
  // The undo of this correction, when it has been undone.
  revertedBy: { id: string; correctedAt: Date } | null;
}

/** One field of the corrected play, before and after. */
export interface FieldChange {
  field: CorrectableField;
  from: unknown;
  to: unknown;
}

/** One player's counting stats that a correction changes. */
export interface PlayerStatChange {
  playerId: string;
  playerName: string;
  stats: { field: CountingStatField; before: number | null; after: number }[];
}

/** What a correction does: to the play, and to the game's player stats. */
export interface CorrectionOutcome {
  gameId: string;
  sequence: number;
  season: string;
  changes: FieldChange[];
  statChanges: PlayerStatChange[];
}

/** A saved correction: its outcome, the audit row, and releases staled. */
export interface SavedCorrection extends CorrectionOutcome {
  correction: EventCorrection;
  releasesMarkedStale: number;
}

// Everything planCorrection decides; applyCorrectionPlan writes exactly this.
interface CorrectionPlan {
  snapshot: GameSnapshot;
  sequence: number;
  current: CorrectableEvent;
  corrected: CorrectableEvent;
  changedFields: CorrectableField[];
  recomputes: PlayerStatRecompute[];
}

function invalidCorrection(message: string): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CORRECTION", message);
}

function notFound(message: string): ApiException {
  return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
}

function correctionConflict(message: string): ApiException {
  return new ApiException(HttpStatus.CONFLICT, "CORRECTION_CONFLICT", message);
}

function pickCorrectableFields(event: GameEvent): CorrectableEvent {
  const { period, clock, eventType, subType, playerId, teamId, success, value, description } = event;
  return { period, clock, eventType, subType, playerId, teamId, success, value, description };
}

function pickFields(event: CorrectableEvent, fields: readonly CorrectableField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, event[field]]));
}

@Injectable()
export class AdminEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ResponseCacheService,
  ) {}

  // Paginated list of all corrections, newest first. The admin page uses
  // this to show the audit trail across the whole platform.
  async listCorrections(
    query: Record<string, unknown>,
  ): Promise<PagedResult<CorrectionWithDetails>> {
    const { page, pageSize } = parsePageParams(query);
    const where = {};

    const [data, total] = await Promise.all([
      this.prisma.eventCorrection.findMany({
        where,
        include: {
          game: { select: { id: true, gameDate: true, season: true, nbaGameId: true } },
          correctedBy: { select: { id: true, name: true } },
          revertedBy: { select: { id: true, correctedAt: true } },
        },
        orderBy: { correctedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.eventCorrection.count({ where }),
    ]);

    return { data, page, pageSize, total };
  }

  // Corrections for one specific game — the game detail admin view uses
  // this to show the correction history alongside the events themselves.
  async listCorrectionsForGame(gameId: string): Promise<CorrectionWithDetails[]> {
    return this.prisma.eventCorrection.findMany({
      where: { gameId },
      include: {
        game: { select: { id: true, gameDate: true, season: true, nbaGameId: true } },
        correctedBy: { select: { id: true, name: true } },
        revertedBy: { select: { id: true, correctedAt: true } },
      },
      orderBy: { correctedAt: "desc" },
    });
  }

  /**
   * Corrects one play and re-derives the game's counting stats from it, in
   * one transaction: the event update, the stat rows, marking the season's
   * dataset releases stale (a release is an immutable snapshot, so it's
   * flagged rather than rewritten) and the EventCorrection audit row either
   * all land or none do. The game row is locked first, so the "before"
   * snapshot and the recompute can't interleave with another correction to
   * the same game.
   * @throws ApiException 404 when the game or play doesn't exist, 400 when
   *   the corrected play breaks a rule (see validateCorrectedEvent).
   */
  async correctEvent(
    gameId: string,
    sequence: number,
    request: CorrectionRequest,
    correctedById: string,
  ): Promise<SavedCorrection> {
    const saved = await this.prisma.$transaction(async (tx) => {
      await this.lockGame(tx, gameId);
      const plan = await this.planCorrection(tx, gameId, sequence, request);
      return this.applyCorrectionPlan(tx, plan, request.reason, correctedById);
    });
    this.invalidateDerivedCaches();
    return saved;
  }

  /**
   * What correctEvent would do with this request (the play's changed
   * fields and every player's stats before -> after), without writing
   * anything. It runs the very planCorrection a save runs, so a preview
   * shows what saving will do unless the game changes in between.
   * @throws ApiException exactly as correctEvent would.
   */
  async previewCorrection(gameId: string, sequence: number, request: CorrectionRequest): Promise<CorrectionOutcome> {
    const plan = await this.planCorrection(this.prisma, gameId, sequence, request);
    return this.describePlan(plan);
  }

  /**
   * Undoes a correction by applying its previousValues as a new correction
   * (linked back through revertsCorrectionId), so history is never
   * deleted. Goes through the same validation, recompute and release
   * staling as any correction.
   * @throws ApiException 404 when the correction doesn't exist; 409 when a
   *   later correction changed any of its fields, or the play no longer
   *   holds the values it set (e.g. it was re-ingested).
   */
  async revertCorrection(correctionId: string, reason: string, correctedById: string): Promise<SavedCorrection> {
    const saved = await this.prisma.$transaction(async (tx) => {
      const original = await tx.eventCorrection.findUnique({ where: { id: correctionId } });
      if (original === null) throw notFound("Correction not found");
      await this.lockGame(tx, original.gameId);
      await this.assertNotSuperseded(tx, original);
      await this.assertPlayStillHolds(tx, original);

      const patch = this.readCorrectableValues(original.previousValues);
      const plan = await this.planCorrection(tx, original.gameId, original.sequence, { patch, reason });
      return this.applyCorrectionPlan(tx, plan, reason, correctedById, original.id);
    });
    this.invalidateDerivedCaches();
    return saved;
  }

  /** The correctable fields out of a stored previousValues/newValues snapshot. */
  private readCorrectableValues(snapshot: Prisma.JsonValue): Partial<CorrectableEvent> {
    const values = (snapshot ?? {}) as Record<string, unknown>;
    return Object.fromEntries(
      CORRECTABLE_FIELDS.filter((field) => field in values).map((field) => [field, values[field]]),
    ) as Partial<CorrectableEvent>;
  }

  /**
   * @throws ApiException 409 when a correction to the same play made after
   *   `original` changed any field `original` changed — including an undo
   *   of `original` itself. Undoing `original` then would overwrite it.
   */
  private async assertNotSuperseded(tx: Prisma.TransactionClient, original: EventCorrection): Promise<void> {
    const fields = Object.keys(this.readCorrectableValues(original.newValues));
    // gte + not-self rather than gt: correctedAt is stored to the
    // millisecond, and a tie must count as "later", never be missed.
    const laterCorrections = await tx.eventCorrection.findMany({
      where: {
        gameId: original.gameId,
        sequence: original.sequence,
        correctedAt: { gte: original.correctedAt },
        id: { not: original.id },
      },
      orderBy: { correctedAt: "asc" },
    });
    const conflicting = laterCorrections.find((later) =>
      Object.keys(this.readCorrectableValues(later.newValues)).some((field) => fields.includes(field)),
    );
    if (conflicting === undefined) return;
    if (conflicting.revertsCorrectionId === original.id) throw correctionConflict("This correction has already been undone");
    throw correctionConflict(
      `A later correction (${conflicting.correctedAt.toISOString()}) changed the same fields of this play; undo that one first`,
    );
  }

  /**
   * @throws ApiException 409 when the play no longer holds the values
   *   `original` set, e.g. because it was re-ingested since.
   */
  private async assertPlayStillHolds(tx: Prisma.TransactionClient, original: EventCorrection): Promise<void> {
    const storedEvent = await tx.gameEvent.findUnique({
      where: { gameId_sequence: { gameId: original.gameId, sequence: original.sequence } },
    });
    if (storedEvent === null) throw notFound("Event not found");
    const current = pickCorrectableFields(storedEvent);
    const setValues = this.readCorrectableValues(original.newValues);
    const changedField = (Object.keys(setValues) as CorrectableField[]).find((field) => current[field] !== setValues[field]);
    if (changedField === undefined) return;
    throw correctionConflict(
      `This play's ${changedField} has changed since the correction (it may have been re-ingested), so undoing it would overwrite newer data`,
    );
  }

  // Replays one game's derivation on demand — the same recomputation
  // correctEvent runs automatically, exposed as its own admin action for
  // when nothing was actually mistyped (no GameEvent field to correct) but
  // the stored PlayerGameStat rows are suspected stale anyway, e.g. after a
  // manual data fix applied straight to Postgres, or as a sanity re-check.
  // Unlike correctEvent, this never touches GameEvent or EventCorrection —
  // it only re-runs the same aggregation over whatever events already exist.
  async replayGame(gameId: string): Promise<{ gameId: string; playersRecomputed: number; playersChanged: number }> {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockGame(tx, gameId);
      const snapshot = await loadGameSnapshot(tx, gameId);
      if (snapshot === null) throw notFound("Game not found");
      const recomputes = planStatRecompute(snapshot.events, snapshot.statRows, buildNamesByPlayerId(snapshot));
      await this.writeRecomputedStats(tx, gameId, recomputes);
      const playersChanged = recomputes.filter((recompute) => recompute.changedFields.length > 0).length;
      return { gameId, playersRecomputed: recomputes.length, playersChanged };
    });
    this.invalidateDerivedCaches();
    return result;
  }

  /**
   * Row-locks the game until the transaction ends, serialising every
   * correction, undo and replay of it.
   * @throws ApiException 404 when the game doesn't exist.
   */
  private async lockGame(tx: Prisma.TransactionClient, gameId: string): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Game" WHERE "id" = ${gameId} FOR UPDATE`;
    if (rows.length === 0) throw notFound("Game not found");
  }

  /**
   * Works out everything a correction would do without writing anything:
   * the stored play with the patch merged in, validated; its credit
   * rewritten if one was chosen; the fields that actually change; and every
   * recomputed player's stats. A preview returns this plan and a save
   * writes it, so the two can't disagree.
   * @throws ApiException 404 / 400 as for correctEvent, and 400 when the
   *   request changes nothing.
   */
  private async planCorrection(
    db: Prisma.TransactionClient,
    gameId: string,
    sequence: number,
    request: CorrectionRequest,
  ): Promise<CorrectionPlan> {
    const snapshot = await loadGameSnapshot(db, gameId);
    if (snapshot === null) throw notFound("Game not found");
    const storedEvent = snapshot.events.find((event) => event.sequence === sequence);
    if (storedEvent === undefined) throw notFound("Event not found");

    const current = pickCorrectableFields(storedEvent);
    const corrected: CorrectableEvent = { ...current, ...request.patch };
    const teamIdByRosterPlayerId = resolveGameTeamByPlayerId(snapshot, sequence);
    const retainedTeamByPlayerId = this.retainPreviousPlayer(current, teamIdByRosterPlayerId);
    const errors = validateCorrectedEvent(corrected, {
      homeTeamId: snapshot.game.homeTeamId,
      awayTeamId: snapshot.game.awayTeamId,
      teamIdByRosterPlayerId,
      originalPlayerId: current.playerId,
    });
    if (errors.length === 0 && request.creditPlayerId !== undefined) {
      const credit = this.rewriteCredit(snapshot, sequence, corrected, request.creditPlayerId, retainedTeamByPlayerId);
      if ("error" in credit) errors.push(credit.error);
      else corrected.description = credit.description;
    }
    if (errors.length > 0) throw invalidCorrection(errors.join("; "));

    const changedFields = CORRECTABLE_FIELDS.filter((field) => corrected[field] !== current[field]);
    if (changedFields.length === 0) throw invalidCorrection("Nothing to change: the play already has these values");

    const correctedEvents = this.replaceEvent(snapshot.events, sequence, corrected);
    const recomputes = planStatRecompute(
      correctedEvents,
      snapshot.statRows,
      buildNamesByPlayerId(snapshot),
      retainedTeamByPlayerId,
    );
    return { snapshot, sequence, current, corrected, changedFields, recomputes };
  }

  /**
   * The corrected play's player before the correction (if they're on the
   * game's roster) -> their team, for planStatRecompute to retain. Without
   * this, moving a player's only play to someone else skipped them in the
   * recompute (they no longer act), so both players ended up with its points.
   */
  private retainPreviousPlayer(
    current: CorrectableEvent,
    teamIdByRosterPlayerId: Map<string, string | null>,
  ): Map<string, string | null> {
    if (current.playerId === null || !teamIdByRosterPlayerId.has(current.playerId)) return new Map();
    return new Map([[current.playerId, teamIdByRosterPlayerId.get(current.playerId) ?? current.teamId]]);
  }

  private replaceEvent(events: GameEvent[], sequence: number, corrected: CorrectableEvent): GameEvent[] {
    return events.map((event) => (event.sequence === sequence ? { ...event, ...corrected } : event));
  }

  /**
   * The corrected play's description with its credit set to
   * `creditPlayerId` (null: no credit), resolved against the same roster
   * the derivation will use. Leaves the description alone when it already
   * credits that player and carries no suffix the play can't take.
   */
  private rewriteCredit(
    snapshot: GameSnapshot,
    sequence: number,
    corrected: CorrectableEvent,
    creditPlayerId: string | null,
    retainedTeamByPlayerId: Map<string, string | null>,
  ): CreditRewriteResult {
    const stat = creditStatFor(corrected);
    if (stat === null) {
      if (creditPlayerId !== null) {
        return { error: "This play takes no credit: only a made shot (assist), missed shot (block) or turnover (steal) does" };
      }
      return { description: stripCreditSuffixes(corrected.description) };
    }

    const namesByPlayerId = buildNamesByPlayerId(snapshot);
    const correctedEvents = this.replaceEvent(snapshot.events, sequence, corrected);
    const roster = buildGameRoster(correctedEvents, namesByPlayerId, retainedTeamByPlayerId);
    const currentCreditId = resolveSecondaryPlayer(corrected.description, stat, roster, corrected.teamId);
    if (currentCreditId === creditPlayerId && !hasInapplicableCreditSuffix(corrected.description, stat)) {
      return { description: corrected.description };
    }
    if (creditPlayerId === null) return { description: stripCreditSuffixes(corrected.description) };

    const name = namesByPlayerId.get(creditPlayerId);
    if (name === undefined) return { error: `creditPlayerId ${creditPlayerId} did not play in this game` };
    const earlierCreditCount = correctedEvents.filter(
      (event) =>
        event.sequence < sequence &&
        creditStatFor(event) === stat &&
        resolveSecondaryPlayer(event.description, stat, roster, event.teamId) === creditPlayerId,
    ).length;
    return rewriteCreditSuffix({
      event: corrected,
      stat,
      creditedPlayer: { playerId: creditPlayerId, name },
      roster,
      earlierCreditCount,
    });
  }

  /**
   * Writes a plan: the event, the stats, stale releases, the audit row.
   * `revertsCorrectionId` links an undo to the correction it reverts.
   */
  private async applyCorrectionPlan(
    tx: Prisma.TransactionClient,
    plan: CorrectionPlan,
    reason: string,
    correctedById: string,
    revertsCorrectionId: string | null = null,
  ): Promise<SavedCorrection> {
    const { snapshot, sequence, changedFields } = plan;
    const gameId = snapshot.game.id;
    await tx.gameEvent.update({
      where: { gameId_sequence: { gameId, sequence } },
      data: pickFields(plan.corrected, changedFields),
    });
    await this.writeRecomputedStats(tx, gameId, plan.recomputes);
    const { count: releasesMarkedStale } = await tx.datasetRelease.updateMany({
      where: { season: snapshot.game.season },
      data: { isStale: true },
    });
    const correction = await tx.eventCorrection.create({
      data: {
        gameId,
        sequence,
        previousValues: pickFields(plan.current, changedFields) as Prisma.InputJsonValue,
        newValues: pickFields(plan.corrected, changedFields) as Prisma.InputJsonValue,
        correctedById,
        reason,
        revertsCorrectionId,
      },
    });
    return { ...this.describePlan(plan), correction, releasesMarkedStale };
  }

  /** Overwrites the counting stats of every recomputed player whose stats changed. */
  private async writeRecomputedStats(
    tx: Prisma.TransactionClient,
    gameId: string,
    recomputes: PlayerStatRecompute[],
  ): Promise<void> {
    await Promise.all(
      recomputes
        .filter((recompute) => recompute.changedFields.length > 0)
        .map((recompute) =>
          tx.playerGameStat.update({
            where: { playerId_gameId: { playerId: recompute.playerId, gameId } },
            data: recompute.after,
          }),
        ),
    );
  }

  /** A plan as the admin sees it: changed fields and per-player stat diffs. */
  private describePlan(plan: CorrectionPlan): CorrectionOutcome {
    const { snapshot } = plan;
    const statChanges = plan.recomputes
      .filter((recompute) => recompute.changedFields.length > 0)
      .map((recompute) => {
        const player = snapshot.rosterPlayersById.get(recompute.playerId);
        return {
          playerId: recompute.playerId,
          playerName: player ? `${player.firstName} ${player.lastName}` : recompute.playerId,
          stats: recompute.changedFields.map((field) => ({
            field,
            before: recompute.before[field],
            after: recompute.after[field],
          })),
        };
      });
    return {
      gameId: snapshot.game.id,
      sequence: plan.sequence,
      season: snapshot.game.season,
      changes: plan.changedFields.map((field) => ({ field, from: plan.current[field], to: plan.corrected[field] })),
      statChanges,
    };
  }

  // Invalidates cached reads that depended on this game's events or any
  // player stat derived from them. The "games" and "players" prefixes cover
  // both the game detail page and any player stat listing.
  private invalidateDerivedCaches(): void {
    this.cache.invalidate("games");
    this.cache.invalidate("players");
  }
}
