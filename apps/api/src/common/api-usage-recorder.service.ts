import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

export const USAGE_FLUSH_INTERVAL_IN_MILLISECONDS = 5_000;
// Flush early once this many rows are waiting, so a burst can't build an
// unbounded buffer between timer ticks.
export const MAX_PENDING_USAGE_ROWS = 500;

// Recorded at admission, before the handler runs, as the guard always has.
const ADMITTED_STATUS_CODE = 200;

/** One admitted request, as the guard saw it. */
export interface ApiUsage {
  consumerId: string;
  keyId: string;
  endpoint: string;
}

interface PendingUsageRow {
  consumerId: string;
  endpoint: string;
  statusCode: number;
  calledAt: Date;
}

/**
 * Writes the per-request ApiUsageLog rows and each key's lastUsedAt in
 * batches, instead of a two-write transaction on every keyed request.
 *
 * The usage log is what the admin and profile pages count, and what the
 * rate limiter reloads its counts from after a restart, so rows keep their
 * real request time and are written within a few seconds. lastUsedAt is
 * accurate to the flush that wrote it.
 *
 * A failed flush is logged and dropped, never retried into a request:
 * usage logging must never break or slow the request it describes. Rows
 * still waiting when the process stops without a clean shutdown (at most
 * one interval's worth) are lost, the same trade the response cache makes.
 */
@Injectable()
export class ApiUsageRecorder implements OnModuleDestroy {
  private readonly logger = new Logger(ApiUsageRecorder.name);
  private pendingUsageRows: PendingUsageRow[] = [];
  private usedKeyIds = new Set<string>();
  private readonly flushTimer: ReturnType<typeof setInterval>;

  constructor(private readonly prisma: PrismaService) {
    this.flushTimer = setInterval(() => void this.flushUsage(), USAGE_FLUSH_INTERVAL_IN_MILLISECONDS);
    // Never the reason the process (or a test run) stays alive.
    this.flushTimer.unref();
  }

  /** Queues one admitted request for the next flush. */
  recordUsage(usage: ApiUsage): void {
    this.pendingUsageRows.push({
      consumerId: usage.consumerId,
      endpoint: usage.endpoint,
      statusCode: ADMITTED_STATUS_CODE,
      calledAt: new Date(),
    });
    this.usedKeyIds.add(usage.keyId);
    if (this.pendingUsageRows.length >= MAX_PENDING_USAGE_ROWS) void this.flushUsage();
  }

  /**
   * Writes every queued row and stamps lastUsedAt on every key used since
   * the last flush. The buffers are swapped out first, so requests admitted
   * while the write is in flight queue for the next flush.
   */
  async flushUsage(): Promise<void> {
    if (this.pendingUsageRows.length === 0) return;
    const usageRows = this.pendingUsageRows;
    const keyIds = [...this.usedKeyIds];
    this.pendingUsageRows = [];
    this.usedKeyIds = new Set();

    try {
      await this.prisma.apiUsageLog.createMany({ data: usageRows });
      // updateMany, not update: a key purged since it was used matches
      // nothing here rather than throwing.
      await this.prisma.apiKey.updateMany({ where: { id: { in: keyIds } }, data: { lastUsedAt: new Date() } });
    } catch (error) {
      this.logger.warn(`Dropped ${usageRows.length} API usage rows: ${(error as Error).message}`);
    }
  }

  /** Stops the timer and writes whatever is still queued. */
  async onModuleDestroy(): Promise<void> {
    clearInterval(this.flushTimer);
    await this.flushUsage();
  }
}
