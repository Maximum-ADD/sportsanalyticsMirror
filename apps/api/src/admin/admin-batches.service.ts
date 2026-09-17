import { Injectable } from "@nestjs/common";
import { IngestionBatchStatus } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ResponseCacheService } from "../cache/response-cache.service.js";

// One row from the batch list, joined with game and reviewer so the admin
// page can show the game date, source, and who reviewed it without extra
// round trips.
export interface BatchWithDetails {
  id: string;
  gameId: string;
  source: string;
  status: IngestionBatchStatus;
  startedAt: Date;
  completedAt: Date | null;
  eventsAccepted: number;
  eventsRejected: number;
  rejectionSummary: unknown;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  game: {
    id: string;
    gameDate: Date;
    season: string;
    nbaGameId: string;
    homeTeam: { name: string };
    awayTeam: { name: string };
  };
  reviewedBy: { id: string; name: string } | null;
}

// Filters the admin can apply on the batch list — status and a search
// term that matches the NBA game id or either team name.
export interface BatchListQuery {
  status?: string;
  search?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  order?: string;
}

// How the batch list can be ordered. "date" is the date the game was
// played, which is what the list's Date column shows; "ingested" is when
// the pull that produced the batch ran. They are unrelated: one pull
// creates hundreds of batches within seconds, so ordering by ingest time
// leaves game dates in an arbitrary order that reads as unsorted.
export type BatchSortField = "date" | "season" | "ingested";
export type SortDirection = "asc" | "desc";

const DEFAULT_SORT_FIELD: BatchSortField = "date";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";
const BATCH_SORT_FIELDS: BatchSortField[] = ["date", "season", "ingested"];

export interface BatchSort {
  field: BatchSortField;
  direction: SortDirection;
}

/**
 * Reads the sort field and direction off a query string, falling back to
 * newest game first. Unrecognised values fall back rather than erroring, so
 * a stale bookmarked URL still returns a sensible list.
 */
export function parseBatchSort(query: Record<string, unknown>): BatchSort {
  const requestedField = typeof query.sort === "string" ? query.sort : "";
  const field = BATCH_SORT_FIELDS.includes(requestedField as BatchSortField)
    ? (requestedField as BatchSortField)
    : DEFAULT_SORT_FIELD;
  const direction: SortDirection = query.order === "asc" ? "asc" : DEFAULT_SORT_DIRECTION;
  return { field, direction };
}

/**
 * Builds the Prisma orderBy for a batch sort.
 *
 * Game date and season live on the related Game, so those sorts order
 * through the relation. Every sort ends with startedAt as a tiebreaker:
 * a night's games share a date, and without it their relative order would
 * shuffle between pages of the same query.
 */
function buildBatchOrderBy(sort: BatchSort) {
  if (sort.field === "ingested") {
    return [{ startedAt: sort.direction }];
  }
  if (sort.field === "season") {
    return [{ game: { season: sort.direction } }, { game: { gameDate: sort.direction } }, { startedAt: DEFAULT_SORT_DIRECTION }];
  }
  return [{ game: { gameDate: sort.direction } }, { startedAt: DEFAULT_SORT_DIRECTION }];
}

function getSearchTerms(search: unknown): string[] {
  return typeof search === "string" ? search.trim().split(/\s+/).filter(Boolean) : [];
}

@Injectable()
export class AdminBatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ResponseCacheService,
  ) {}

  // Paginated batch list with optional status and search filters.
  async listBatches(query: Record<string, unknown>): Promise<PagedResult<BatchWithDetails>> {
    const { page, pageSize } = parsePageParams(query);
    const sort = parseBatchSort(query);
    const searchTerms = getSearchTerms(query.search);
    const statusFilter = typeof query.status === "string" ? query.status : undefined;

    const where: Record<string, unknown> = {
      // Exclude soft-deleted batches
      deletedAt: null,
    };
    if (statusFilter && Object.values(IngestionBatchStatus).includes(statusFilter as IngestionBatchStatus)) {
      where.status = statusFilter;
    }
    if (searchTerms.length > 0) {
      where.game = {
        OR: searchTerms.flatMap((term) => [
          { nbaGameId: { contains: term, mode: "insensitive" } },
          { homeTeam: { name: { contains: term, mode: "insensitive" } } },
          { awayTeam: { name: { contains: term, mode: "insensitive" } } },
        ]),
      };
    }

    const include = {
      game: {
        select: {
          id: true,
          gameDate: true,
          season: true,
          nbaGameId: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
      reviewedBy: { select: { id: true, name: true } },
    };

    const [data, total] = await Promise.all([
      this.prisma.ingestionBatch.findMany({
        where,
        include,
        orderBy: buildBatchOrderBy(sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ingestionBatch.count({ where }),
    ]);

    return { data: data as unknown as BatchWithDetails[], page, pageSize, total };
  }

  // Single batch with full details — the admin detail view.
  async getBatchById(batchId: string): Promise<BatchWithDetails | null> {
    const batch = await this.prisma.ingestionBatch.findUnique({
      where: { id: batchId },
      include: {
        game: {
          select: {
            id: true,
            gameDate: true,
            season: true,
            nbaGameId: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
    // Exclude soft-deleted batches
    if (batch?.deletedAt) return null;
    return batch as unknown as BatchWithDetails | null;
  }

  // Promote a PENDING_REVIEW batch to COMPLETED — the admin has reviewed
  // the events and accepts them as published.
  async approveBatch(batchId: string, reviewedById: string, reviewNotes?: string) {
    const result = await this.prisma.ingestionBatch.update({
      where: { id: batchId, deletedAt: null },
      data: {
        status: IngestionBatchStatus.COMPLETED,
        reviewedById,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes ?? null,
      },
    });

    // Newly approved events may change public stats — invalidate the
    // game and player caches.
    this.cache.invalidate("games");
    this.cache.invalidate("players");

    return result;
  }

  // Mark a PENDING_REVIEW batch as REJECTED — the admin has found issues
  // that need the pipeline to re-submit.
  async rejectBatch(batchId: string, reviewedById: string, reviewNotes?: string) {
    return this.prisma.ingestionBatch.update({
      where: { id: batchId, deletedAt: null },
      data: {
        status: IngestionBatchStatus.REJECTED,
        reviewedById,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes ?? null,
      },
    });
  }
}
