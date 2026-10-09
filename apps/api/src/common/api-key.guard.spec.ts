import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ApiKeyGuard } from "./api-key.guard.js";
import { ApiException } from "./api-exception.js";
import type { ApiKeyLookupService, ResolvedApiKey } from "./api-key-lookup.service.js";
import type { ApiUsageRecorder } from "./api-usage-recorder.service.js";
import type { ConsumerRateLimiter, RateLimitDecision } from "./consumer-rate-limiter.service.js";

const ACTIVE_KEY: ResolvedApiKey = {
  keyId: "key-1",
  consumer: { id: "c1", name: "Test", rateLimit: 60, dailyQuota: 1000 },
};

function createRequest(opts: { user?: { id: string }; apiKey?: string }) {
  return {
    headers: opts.apiKey ? { "x-api-key": opts.apiKey } : {},
    user: opts.user,
    method: "GET",
    route: { path: "/v1/players" },
  } as Record<string, unknown>;
}

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function createGuard(opts: { resolvedKey?: ResolvedApiKey | null; decision?: RateLimitDecision } = {}) {
  const apiKeyLookup = { findActiveKey: vi.fn().mockResolvedValue(opts.resolvedKey ?? null) };
  const rateLimiter = { admitRequest: vi.fn().mockResolvedValue(opts.decision ?? "ADMITTED") };
  const usageRecorder = { recordUsage: vi.fn() };
  const guard = new ApiKeyGuard(
    apiKeyLookup as unknown as ApiKeyLookupService,
    rateLimiter as unknown as ConsumerRateLimiter,
    usageRecorder as unknown as ApiUsageRecorder,
  );
  return { guard, apiKeyLookup, rateLimiter, usageRecorder };
}

async function expectRejection(promise: Promise<boolean>, status: number, code: string): Promise<void> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ApiException);
  expect((error as ApiException).getStatus()).toBe(status);
  expect(JSON.stringify((error as ApiException).getResponse())).toContain(code);
}

describe("ApiKeyGuard", () => {
  it("passes through when SessionAuthGuard already authenticated the request, without touching the key", async () => {
    const { guard, apiKeyLookup, usageRecorder } = createGuard();

    expect(await guard.canActivate(createContext(createRequest({ user: { id: "user-1" } })))).toBe(true);
    expect(apiKeyLookup.findActiveKey).not.toHaveBeenCalled();
    expect(usageRecorder.recordUsage).not.toHaveBeenCalled();
  });

  it("rejects with 401 API_KEY_REQUIRED when there is no API key and no session", async () => {
    const { guard } = createGuard();

    await expectRejection(guard.canActivate(createContext(createRequest({}))), 401, "API_KEY_REQUIRED");
  });

  it("rejects a whitespace-only key the same way as a missing one", async () => {
    const { guard, apiKeyLookup } = createGuard();

    await expectRejection(guard.canActivate(createContext(createRequest({ apiKey: "   " }))), 401, "API_KEY_REQUIRED");
    expect(apiKeyLookup.findActiveKey).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the key is unknown, revoked or its consumer is deactivated", async () => {
    const { guard, rateLimiter } = createGuard({ resolvedKey: null });

    await expectRejection(guard.canActivate(createContext(createRequest({ apiKey: "nba_dead_key" }))), 401, "UNAUTHORIZED");
    expect(rateLimiter.admitRequest).not.toHaveBeenCalled();
  });

  it("rejects with 429 RATE_LIMIT_EXCEEDED, naming the per-minute limit", async () => {
    const { guard, usageRecorder } = createGuard({ resolvedKey: ACTIVE_KEY, decision: "RATE_LIMIT_EXCEEDED" });

    await expectRejection(guard.canActivate(createContext(createRequest({ apiKey: "nba_busy" }))), 429, "RATE_LIMIT_EXCEEDED");
    expect(usageRecorder.recordUsage).not.toHaveBeenCalled();
  });

  it("rejects with 429 DAILY_QUOTA_EXCEEDED, naming the daily quota", async () => {
    const { guard, usageRecorder } = createGuard({ resolvedKey: ACTIVE_KEY, decision: "DAILY_QUOTA_EXCEEDED" });

    await expectRejection(guard.canActivate(createContext(createRequest({ apiKey: "nba_spent" }))), 429, "DAILY_QUOTA_EXCEEDED");
    expect(usageRecorder.recordUsage).not.toHaveBeenCalled();
  });

  it("admits a valid key within its limits, stamps the consumer and records the usage", async () => {
    const { guard, apiKeyLookup, rateLimiter, usageRecorder } = createGuard({ resolvedKey: ACTIVE_KEY });
    const request = createRequest({ apiKey: "nba_valid_key" });

    expect(await guard.canActivate(createContext(request))).toBe(true);
    expect(apiKeyLookup.findActiveKey).toHaveBeenCalledWith("nba_valid_key");
    expect(rateLimiter.admitRequest).toHaveBeenCalledWith(ACTIVE_KEY.consumer);
    expect(request.apiConsumer).toEqual(ACTIVE_KEY.consumer);
    expect(usageRecorder.recordUsage).toHaveBeenCalledWith({
      consumerId: "c1",
      keyId: "key-1",
      endpoint: "GET /v1/players",
    });
  });
});
