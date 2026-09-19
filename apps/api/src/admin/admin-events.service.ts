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
    const retainedTeamByPlayerId = new Map<string, string | null>();
    const errors = validateCorrectedEvent(corrected, {
      homeTeamId: snapshot.game.homeTeamId,
      awayTeamId: snapshot.game.awayTeamId,
      teamIdByRosterPlayerId: resolveGameTeamByPlayerId(snapshot, sequence),
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

  /** Writes a plan: the event, the stats, stale releases, the audit row. */
  private async applyCorrectionPlan(
    tx: Prisma.TransactionClient,
    plan: CorrectionPlan,
    reason: string,
    correctedById: string,
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
