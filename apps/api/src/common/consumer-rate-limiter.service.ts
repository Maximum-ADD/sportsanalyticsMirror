import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ApiKeyConsumer } from "./api-key-lookup.service.js";

export const RATE_LIMIT_WINDOW_IN_MILLISECONDS = 60_000;

/** Whether a request may go ahead, and if not, which limit stopped it. */
export type RateLimitDecision = "ADMITTED" | "RATE_LIMIT_EXCEEDED" | "DAILY_QUOTA_EXCEEDED";

interface ConsumerUsage {
  // Admitted requests in the last minute, oldest first.
  recentRequestTimesInMilliseconds: number[];
  dayKey: string;
  requestsToday: number;
}

/**
 * Holds every consumer to its per-minute rate limit and daily quota,
 * counting admitted requests in memory instead of in Postgres.
 *
 * The guard this replaced counted ApiUsageLog rows twice per request (the
 * last minute, then today), two pooled round trips before any cached read
 * could be served. Here each consumer's counts are loaded from the usage
 * log once, the first time this process sees the consumer, and kept
 * current in memory from then on. So a restart neither resets a consumer's
 * quota nor forgets its last minute.
 *
 * The counts belong to this process. The API runs as one Render instance;
 * if it ever scales out, each instance would enforce the limits on its own
 * share of the traffic, and these counters would need a shared store.
 */
@Injectable()
export class ConsumerRateLimiter {
  private readonly usageByConsumerId = new Map<string, ConsumerUsage>();
  private readonly pendingUsageLoads = new Map<string, Promise<ConsumerUsage>>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admits one request for a consumer if it is inside both limits, and
   * counts it. A request that is turned away is not counted, so a client
   * that backs off gets its budget back as the minute rolls on.
   *
   * The check and the count run with no await between them, so concurrent
   * requests can't both take the last slot.
   *
   * @param consumer - the consumer the request's key belongs to, with its
   *   current limits (requests per minute, requests per day).
   * @returns ADMITTED, or which limit the request would have broken. The
   *   per-minute limit is checked first.
   */
  async admitRequest(consumer: ApiKeyConsumer): Promise<RateLimitDecision> {
    const usage = await this.getConsumerUsage(consumer.id);
    const nowInMilliseconds = Date.now();
    pruneRequestsOutsideWindow(usage, nowInMilliseconds);
    rollOverDay(usage, nowInMilliseconds);

    if (usage.recentRequestTimesInMilliseconds.length >= consumer.rateLimit) return "RATE_LIMIT_EXCEEDED";
    if (usage.requestsToday >= consumer.dailyQuota) return "DAILY_QUOTA_EXCEEDED";

    usage.recentRequestTimesInMilliseconds.push(nowInMilliseconds);
    usage.requestsToday += 1;
    return "ADMITTED";
  }

  // The in-memory counts for one consumer, loaded from the usage log the
  // first time this process sees it. Concurrent first requests share one
  // load rather than each counting the log and overwriting the others.
  private async getConsumerUsage(consumerId: string): Promise<ConsumerUsage> {
    const loadedUsage = this.usageByConsumerId.get(consumerId);
    if (loadedUsage) return loadedUsage;

    let pendingLoad = this.pendingUsageLoads.get(consumerId);
    if (!pendingLoad) {
      pendingLoad = this.loadConsumerUsage(consumerId).finally(() => this.pendingUsageLoads.delete(consumerId));
      this.pendingUsageLoads.set(consumerId, pendingLoad);
    }
    const usage = await pendingLoad;
    // Only the first caller to get here stores the load; a later one must
    // not replace counts that admitted requests have already added to.
    if (!this.usageByConsumerId.has(consumerId)) this.usageByConsumerId.set(consumerId, usage);
    return this.usageByConsumerId.get(consumerId)!;
  }

  private async loadConsumerUsage(consumerId: string): Promise<ConsumerUsage> {
    const nowInMilliseconds = Date.now();
    const [recentRequests, requestsToday] = await Promise.all([
      this.prisma.apiUsageLog.findMany({
        where: { consumerId, calledAt: { gte: new Date(nowInMilliseconds - RATE_LIMIT_WINDOW_IN_MILLISECONDS) } },
        select: { calledAt: true },
        orderBy: { calledAt: "asc" },
      }),
      this.prisma.apiUsageLog.count({
        where: { consumerId, calledAt: { gte: getStartOfDay(nowInMilliseconds) } },
      }),
    ]);
    return {
      recentRequestTimesInMilliseconds: recentRequests.map((request) => request.calledAt.getTime()),
      dayKey: getDayKey(nowInMilliseconds),
      requestsToday,
    };
  }
}

// Drops requests older than the one-minute window. The list is in time
// order, so everything to drop is at the front.
function pruneRequestsOutsideWindow(usage: ConsumerUsage, nowInMilliseconds: number): void {
  const windowStartInMilliseconds = nowInMilliseconds - RATE_LIMIT_WINDOW_IN_MILLISECONDS;
  const firstInsideWindow = usage.recentRequestTimesInMilliseconds.findIndex(
    (requestTimeInMilliseconds) => requestTimeInMilliseconds >= windowStartInMilliseconds,
  );
  usage.recentRequestTimesInMilliseconds.splice(
    0,
    firstInsideWindow === -1 ? usage.recentRequestTimesInMilliseconds.length : firstInsideWindow,
  );
}

// A new day starts the quota at zero. "Day" is the server's local day, the
// same boundary the database count above (and the guard before it) used.
function rollOverDay(usage: ConsumerUsage, nowInMilliseconds: number): void {
  const todayKey = getDayKey(nowInMilliseconds);
  if (usage.dayKey === todayKey) return;
  usage.dayKey = todayKey;
  usage.requestsToday = 0;
}

function getStartOfDay(nowInMilliseconds: number): Date {
  const startOfDay = new Date(nowInMilliseconds);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

function getDayKey(nowInMilliseconds: number): string {
  return getStartOfDay(nowInMilliseconds).toISOString();
}
