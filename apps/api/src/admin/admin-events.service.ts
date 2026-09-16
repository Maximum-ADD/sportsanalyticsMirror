import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { ResponseCacheService } from "../cache/response-cache.service.js";
import type { EventCorrection } from "@prisma/client";
import { COUNTING_STAT_FIELDS, deriveGameEventStats } from "./derive-player-game-stats.js";

// Fields on GameEvent that an admin is allowed to correct — the identity
// and relational fields (id, gameId, sequence, batchId) are locked because
// changing them would break the audit trail's traceability to the original
// event.
const CORRECTABLE_FIELDS = [
  "period",
  "clock",
  "eventType",
  "subType",
  "playerId",
  "teamId",
  "success",
  "value",
  "description",
] as const;

export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

export interface CorrectEventDto {
  [key: string]: unknown;
  reason?: string;
}

// One row from the corrections list, joined with the game and user so the
// admin UI can show which game was corrected and by whom without extra
// round trips.
export interface CorrectionWithDetails extends EventCorrection {
  game: { id: string; gameDate: Date; season: string; nbaGameId: string };
  correctedBy: { id: string; name: string } | null;
}

export function parseCorrectEventBody(body: unknown): CorrectEventDto {
  if (typeof body !== "object" || body === null) {
    throw new Error("Request body must be an object");
  }
  const raw = body as Record<string, unknown>;
  const patch: CorrectEventDto = {};

  let hasField = false;
  for (const field of CORRECTABLE_FIELDS) {
    if (raw[field] !== undefined) {
      hasField = true;
      patch[field] = raw[field];
    }
  }

  if (!hasField) {
    throw new Error("At least one correctable field must be provided");
  }

  if (raw.reason !== undefined) {
    if (typeof raw.reason !== "string" || raw.reason.trim().length === 0) {
      throw new Error("reason must be a non-empty string");
    }
    patch.reason = raw.reason.trim();
  }

  return patch;
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

  // The core correction operation: snapshots the current event, applies
  // the correction, records the audit row, and invalidates the cache so
  // the next read sees the updated stats.
  async correctEvent(
    gameId: string,
    sequence: number,
    patch: CorrectEventDto,
    correctedById: string,
  ): Promise<EventCorrection> {
    // 1. Read the current event row.
    const current = await this.prisma.gameEvent.findUnique({
      where: { gameId_sequence: { gameId, sequence } },
    });
    if (!current) return null as unknown as EventCorrection;

    // 2. Snapshot the fields being changed.
    const previousValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    for (const field of CORRECTABLE_FIELDS) {
      if (patch[field] !== undefined) {
        previousValues[field] = (current as Record<string, unknown>)[field];
        newValues[field] = patch[field];
      }
    }

    // 3. Apply the correction, re-derive every PlayerGameStat counting
    // figure for this one game from its now-corrected events, and write the
    // audit row — all in one transaction, so a correction can never be left
    // half-applied (event changed but stats stale, or vice versa). This is
    // what brings every derived stat back in line with a single correction
    // rather than requiring a full pipeline re-run: only this game's rows
    // are touched, not the whole season (see deriveGameEventStats's module
    // doc comment for why this needs its own player-name index rather than
    // reusing the Python pipeline's).
    const { reason, ...dataPatch } = patch;
    const correction = await this.prisma.$transaction(async (tx) => {
      await tx.gameEvent.update({
        where: { gameId_sequence: { gameId, sequence } },
        data: dataPatch,
      });

      await this.recomputeDerivedStats(tx, gameId);

      return tx.eventCorrection.create({
        data: {
          gameId,
          sequence,
          previousValues: previousValues as Prisma.InputJsonValue,
          newValues: newValues as Prisma.InputJsonValue,
          correctedById,
          reason: reason as string | undefined,
        },
      });
    });

    // 4. Invalidate cached reads that depended on this game's events or
    // any player stat derived from them. The "games" and "players" prefixes
    // cover both the game detail page and any player stat listing.
    this.cache.invalidate("games");
    this.cache.invalidate("players");

    return correction;
  }

  // Re-derives every counting stat (points, shooting splits, rebound split,
  // assists, steals, blocks, turnovers) for one game from its current
  // GameEvent rows, and writes the result over the existing PlayerGameStat
  // rows for that game. Fields this project never derives from events —
  // minutes, plusMinus, usagePercentage, the two ratings, all sourced from
  // the official boxscore feed instead (see PlayerGameStat's schema doc
  // comment) — are left untouched. Only players who already have a stat row
  // for this game are updated: a correction can shift derived figures, but
  // it can't manufacture the boxscore-sourced fields a brand-new player row
  // would need, so this stays a targeted recomputation rather than a
  // from-scratch re-ingest. Returns how many players' rows were touched —
  // both correctEvent and replayGame report it back to the caller.
  private async recomputeDerivedStats(tx: Prisma.TransactionClient, gameId: string): Promise<number> {
    const [events, existingStats] = await Promise.all([
      tx.gameEvent.findMany({ where: { gameId } }),
      tx.playerGameStat.findMany({ where: { gameId }, select: { playerId: true } }),
    ]);
    if (existingStats.length === 0) return 0;

    const playerIds = existingStats.map((row) => row.playerId);
    const players = await tx.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, lastName: true },
    });
    const lastNameByPlayerId = new Map(players.map((player) => [player.id, player.lastName]));

    const derivedByPlayerId = deriveGameEventStats(events, lastNameByPlayerId);

    await Promise.all(
      playerIds.map((playerId) => {
        const derived = derivedByPlayerId.get(playerId);
        const data: Record<(typeof COUNTING_STAT_FIELDS)[number], number> = {} as never;
        for (const field of COUNTING_STAT_FIELDS) data[field] = derived?.[field] ?? 0;

        return tx.playerGameStat.update({
          where: { playerId_gameId: { playerId, gameId } },
          data,
        });
      }),
    );

    return playerIds.length;
  }
}
