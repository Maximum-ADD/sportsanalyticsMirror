import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsumerRateLimiter, RATE_LIMIT_WINDOW_IN_MILLISECONDS } from "./consumer-rate-limiter.service.js";
import type { ApiKeyConsumer } from "./api-key-lookup.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";

// Midday, so a few minutes either side never crosses midnight by accident.
const MIDDAY = new Date(2026, 9, 9, 12, 0, 0);

function createConsumer(overrides: Partial<ApiKeyConsumer> = {}): ApiKeyConsumer {
  return { id: "c1", name: "Test", rateLimit: 3, dailyQuota: 100, ...overrides };
}

function createLimiter(opts: { recentCallTimes?: Date[]; requestsToday?: number } = {}) {
  const findMany = vi.fn().mockResolvedValue((opts.recentCallTimes ?? []).map((calledAt) => ({ calledAt })));
  const count = vi.fn().mockResolvedValue(opts.requestsToday ?? 0);
  const prisma = { apiUsageLog: { findMany, count } } as unknown as PrismaService;
  return { limiter: new ConsumerRateLimiter(prisma), findMany, count };
}

async function admitRepeatedly(limiter: ConsumerRateLimiter, consumer: ApiKeyConsumer, requestCount: number) {
  const decisions = [];
  for (let index = 0; index < requestCount; index += 1) decisions.push(await limiter.admitRequest(consumer));
  return decisions;
}

describe("ConsumerRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("admits requests up to the per-minute limit, then turns the next one away", async () => {
    const { limiter } = createLimiter();

    expect(await admitRepeatedly(limiter, createConsumer({ rateLimit: 3 }), 4)).toEqual([
      "ADMITTED",
      "ADMITTED",
      "ADMITTED",
      "RATE_LIMIT_EXCEEDED",
    ]);
  });

  it("frees the slots again once the minute has passed", async () => {
    const { limiter } = createLimiter();
    const consumer = createConsumer({ rateLimit: 2 });
    await admitRepeatedly(limiter, consumer, 2);

    vi.advanceTimersByTime(RATE_LIMIT_WINDOW_IN_MILLISECONDS + 1);

    expect(await limiter.admitRequest(consumer)).toBe("ADMITTED");
  });

  it("does not count a turned-away request against the consumer", async () => {
    const { limiter } = createLimiter();
    const consumer = createConsumer({ rateLimit: 1, dailyQuota: 2 });
    await limiter.admitRequest(consumer);
    await limiter.admitRequest(consumer); // RATE_LIMIT_EXCEEDED, not counted toward today

    vi.advanceTimersByTime(RATE_LIMIT_WINDOW_IN_MILLISECONDS + 1);

    expect(await limiter.admitRequest(consumer)).toBe("ADMITTED");
  });

  it("turns requests away once the daily quota is used up", async () => {
    const { limiter } = createLimiter({ requestsToday: 99 });
    const consumer = createConsumer({ rateLimit: 10, dailyQuota: 100 });

    expect(await admitRepeatedly(limiter, consumer, 2)).toEqual(["ADMITTED", "DAILY_QUOTA_EXCEEDED"]);
  });

  it("checks the per-minute limit before the daily quota", async () => {
    const { limiter } = createLimiter({ recentCallTimes: [MIDDAY], requestsToday: 100 });

    expect(await limiter.admitRequest(createConsumer({ rateLimit: 1, dailyQuota: 100 }))).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("starts the quota from zero on a new day", async () => {
    const { limiter } = createLimiter({ requestsToday: 100 });
    const consumer = createConsumer({ rateLimit: 10, dailyQuota: 100 });
    expect(await limiter.admitRequest(consumer)).toBe("DAILY_QUOTA_EXCEEDED");

    vi.setSystemTime(new Date(2026, 9, 10, 0, 0, 1));

    expect(await limiter.admitRequest(consumer)).toBe("ADMITTED");
  });

  it("carries the last minute and today's count over from the usage log, so a restart resets nothing", async () => {
    const twentySecondsAgo = new Date(MIDDAY.getTime() - 20_000);
    const { limiter, findMany, count } = createLimiter({ recentCallTimes: [twentySecondsAgo, twentySecondsAgo] });

    expect(await admitRepeatedly(limiter, createConsumer({ rateLimit: 3 }), 2)).toEqual([
      "ADMITTED",
      "RATE_LIMIT_EXCEEDED",
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { consumerId: "c1", calledAt: { gte: new Date(MIDDAY.getTime() - RATE_LIMIT_WINDOW_IN_MILLISECONDS) } },
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: { consumerId: "c1", calledAt: { gte: new Date(2026, 9, 9, 0, 0, 0) } },
    });
  });

  it("reads the usage log once per consumer, however many requests follow", async () => {
    const { limiter, findMany, count } = createLimiter();

    await admitRepeatedly(limiter, createConsumer({ rateLimit: 10 }), 5);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
  });

  it("shares one usage-log read between concurrent first requests, and lets none of them skip the limit", async () => {
    const { limiter, findMany } = createLimiter();
    const consumer = createConsumer({ rateLimit: 2 });

    const decisions = await Promise.all([1, 2, 3].map(() => limiter.admitRequest(consumer)));

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(decisions.filter((decision) => decision === "ADMITTED")).toHaveLength(2);
    expect(decisions).toContain("RATE_LIMIT_EXCEEDED");
  });

  it("counts each consumer separately", async () => {
    const { limiter } = createLimiter();
    await limiter.admitRequest(createConsumer({ id: "c1", rateLimit: 1 }));

    expect(await limiter.admitRequest(createConsumer({ id: "c2", rateLimit: 1 }))).toBe("ADMITTED");
  });

  it("applies a consumer's new limit on its next request", async () => {
    const { limiter } = createLimiter();
    await admitRepeatedly(limiter, createConsumer({ rateLimit: 5 }), 2);

    expect(await limiter.admitRequest(createConsumer({ rateLimit: 2 }))).toBe("RATE_LIMIT_EXCEEDED");
  });
});
