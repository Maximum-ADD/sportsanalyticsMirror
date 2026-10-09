import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { ExportRequestStatus, ExportResource, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { toCsv, type ColumnSpec } from "./csv.js";

// How long a finished export's CSV stays downloadable before the next
// sweep clears it — long enough for a caller polling every few seconds to
// notice SUCCEEDED and fetch the file, short enough that a row doesn't
// hold a multi-megabyte CSV in Postgres indefinitely.
const EXPORT_RETENTION_HOURS = 24;

// Same cap the synchronous export routes already enforce (MAX_EXPORT_ROWS
// in players.controller.ts, the literal 5_000 in games.controller.ts) —
// kept here too since a queued export's row ceiling must match whichever
// path produced it, rather than silently diverging if one changes.
const MAX_EXPORT_ROWS = 5000;

export interface ExportRequestSummary {
  id: string;
  status: ExportRequestStatus;
  resource: ExportResource;
  requestedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  message: string | null;
  rowCount: number | null;
}

// What queueExport needs to actually build the CSV once the worker picks
// the request up — the same (query, maximumRows) -> rows shape
// PlayersService.getMatchingPlayers and GamesService.getGamesForExport
// already have, so queuing a resource's export is adding this function,
// not rewriting the resource's own fetch/column logic.
export interface ExportBuilder<T> {
  fetchRows(query: Record<string, unknown>, maximumRows: number): Promise<T[]>;
  columns: ColumnSpec<T>[];
}

/**
 * Large consumer CSV exports as a background job — the Advanced tier's
 * "large requests as jobs" (`docs/PROJECT_OVERVIEW.md`'s "Known gaps" used
 * to list this; see the schema doc comment on ExportRequest for the full
 * design). A resource's controller registers its own ExportBuilder once,
 * at construction; queueExport/getExportById are resource-agnostic.
 *
 * Mirrors IngestionRequest's queued/polled shape — a status column a
 * caller polls — but the worker runs IN this process (processNextQueued,
 * on a 5-second @Cron tick) rather than needing a separate process the
 * way apps/ingestion/pull_worker.py does: nothing an export needs (Prisma,
 * the resource's own fetch function, toCsv) requires an environment this
 * server doesn't already have.
 */
@Injectable()
export class ExportRequestsService {
  private readonly logger = new Logger(ExportRequestsService.name);
  private readonly builders = new Map<ExportResource, ExportBuilder<unknown>>();

  constructor(private readonly prisma: PrismaService) {}

  /** Registers the fetch/columns for one resource — called once, from that resource's own module. */
  registerBuilder<T>(resource: ExportResource, builder: ExportBuilder<T>): void {
    this.builders.set(resource, builder as ExportBuilder<unknown>);
  }

  /** Queues a resource's export for the worker to pick up; returns the id a caller polls. */
  async queueExport(resource: ExportResource, query: Record<string, unknown>): Promise<ExportRequestSummary> {
    return this.prisma.exportRequest.create({
      data: { resource, query: query as Prisma.InputJsonValue },
      select: EXPORT_SUMMARY_SELECT,
    });
  }

  /** The request's current status, or null if it doesn't exist or has expired. */
  async getExportById(id: string): Promise<ExportRequestSummary | null> {
    const request = await this.prisma.exportRequest.findUnique({ where: { id }, select: EXPORT_SUMMARY_SELECT });
    if (!request) return null;
    return request;
  }

  /** The finished CSV, or null if the request isn't SUCCEEDED (yet, or ever) or has expired. */
  async getExportCsv(id: string): Promise<{ csv: string; resource: ExportResource } | null> {
    const request = await this.prisma.exportRequest.findUnique({
      where: { id },
      select: { status: true, csv: true, resource: true, expiresAt: true },
    });
    if (!request || request.status !== "SUCCEEDED" || request.csv === null) return null;
    if (request.expiresAt !== null && request.expiresAt.getTime() <= Date.now()) return null;
    return { csv: request.csv, resource: request.resource };
  }

  /**
   * Picks up the oldest QUEUED request, if any, and runs it to completion
   * (or failure) before returning. One at a time, like IngestionRequest's
   * "only one pull at a time" rule — exports are rare enough that
   * throughput was never the reason to queue them; avoiding an unbounded
   * request blocking its own HTTP response was.
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async processNextQueued(): Promise<void> {
    const request = await this.prisma.exportRequest.findFirst({
      where: { status: "QUEUED" },
      orderBy: { requestedAt: "asc" },
    });
    if (!request) return;

    const claimed = await this.prisma.exportRequest.updateMany({
      where: { id: request.id, status: "QUEUED" },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    // Lost the claim to nothing (there's only ever this one worker today,
    // but updateMany's affected-count is the honest way to notice that
    // rather than assume it).
    if (claimed.count === 0) return;

    const builder = this.builders.get(request.resource);
    if (!builder) {
      await this.failExport(request.id, `No export builder registered for resource ${request.resource}`);
      return;
    }

    try {
      const rows = await builder.fetchRows(request.query as Record<string, unknown>, MAX_EXPORT_ROWS);
      const csv = toCsv(rows, builder.columns);
      await this.prisma.exportRequest.update({
        where: { id: request.id },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          csv,
          rowCount: rows.length,
          expiresAt: new Date(Date.now() + EXPORT_RETENTION_HOURS * 60 * 60 * 1000),
        },
      });
    } catch (error) {
      this.logger.error(`Export ${request.id} (${request.resource}) failed: ${(error as Error).message}`);
      await this.failExport(request.id, (error as Error).message);
    }
  }

  private async failExport(id: string, message: string): Promise<void> {
    await this.prisma.exportRequest.update({
      where: { id },
      data: { status: "FAILED", finishedAt: new Date(), message },
    });
  }

  /** Clears an expired SUCCEEDED export's CSV — the retention window ExportRequestsService documents. */
  @Cron(CronExpression.EVERY_HOUR)
  async sweepExpired(): Promise<void> {
    await this.prisma.exportRequest.updateMany({
      where: { expiresAt: { lte: new Date() }, csv: { not: null } },
      data: { csv: null },
    });
  }
}

const EXPORT_SUMMARY_SELECT = {
  id: true,
  status: true,
  resource: true,
  requestedAt: true,
  startedAt: true,
  finishedAt: true,
  message: true,
  rowCount: true,
} as const;
