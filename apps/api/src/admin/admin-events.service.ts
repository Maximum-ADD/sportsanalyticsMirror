import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { ResponseCacheService } from "../cache/response-cache.service.js";
import type { EventCorrection } from "@prisma/client";

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

    // 3. Apply the correction and write the audit row in one transaction
    // so a partial failure can't leave the event changed without a record
    // of why.
    const { reason, ...dataPatch } = patch;
    const correction = await this.prisma.$transaction(async (tx) => {
      await tx.gameEvent.update({
        where: { gameId_sequence: { gameId, sequence } },
        data: dataPatch,
      });

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
}
