import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ApiKeyGuard } from "./api-key.guard.js";
import { ApiException } from "./api-exception.js";
import type { PrismaService } from "../prisma/prisma.service.js";

function createContext(opts: {
  user?: { id: string };
  apiKey?: string;
}): ExecutionContext {
  return {
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: opts.apiKey ? { "x-api-key": opts.apiKey } : {},
        user: opts.user,
        method: "GET",
        route: { path: "/v1/players" },
      }),
    }),
  } as unknown as ExecutionContext;
}

function createMockPrisma(opts: {
  key?: { isActive: boolean; consumer: { id: string; isActive: boolean; name: string; rateLimit: number; dailyQuota: number } } | null;
  recentCount?: number;
  dailyCount?: number;
}): PrismaService {
  return {
    apiKey: {
      findUnique: vi.fn().mockResolvedValue(
        opts.key
          ? { id: "key-1", keyHash: "hash", isActive: opts.key.isActive, consumer: opts.key.consumer }
          : null,
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    apiUsageLog: {
      count: vi.fn()
        .mockResolvedValueOnce(opts.recentCount ?? 0)
        .mockResolvedValueOnce(opts.dailyCount ?? 0),
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaService;
}

describe("ApiKeyGuard", () => {
  it("passes through when SessionAuthGuard already authenticated the request", async () => {
    const prisma = createMockPrisma({ key: null });
    const guard = new ApiKeyGuard(prisma);
    const ctx = createContext({ user: { id: "user-1" } });

    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it("rejects when there is no API key and no session (anonymous)", async () => {
    const prisma = createMockPrisma({ key: null });
    const guard = new ApiKeyGuard(prisma);
    const ctx = createContext({});

    await expect(guard.canActivate(ctx)).rejects.toThrow(ApiException);
  });

  it("rejects when the API key hash doesn't match any row", async () => {
    const prisma = createMockPrisma({ key: null });
    const guard = new ApiKeyGuard(prisma);
    const ctx = createContext({ apiKey: "nba_invalid_key" });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ApiException);
  });

  it("rejects when the API key is inactive", async () => {
    const prisma = createMockPrisma({
      key: {
        isActive: false,
        consumer: { id: "c1", isActive: true, name: "Test", rateLimit: 60, dailyQuota: 1000 },
      },
    });
    const guard = new ApiKeyGuard(prisma);
    const ctx = createContext({ apiKey: "nba_dead_key" });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ApiException);
  });

  it("rejects when the consumer is inactive", async () => {
    const prisma = createMockPrisma({
      key: {
        isActive: true,
        consumer: { id: "c1", isActive: false, name: "Test", rateLimit: 60, dailyQuota: 1000 },
      },
    });
    const guard = new ApiKeyGuard(prisma);
    const ctx = createContext({ apiKey: "nba_consumer_dead" });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ApiException);
  });

  it("rejects when the rate limit is exceeded", async () => {
    const prisma = createMockPrisma({
      key: {
        isActive: true,
        consumer: { id: "c1", isActive: true, name: "Test", rateLimit: 60, dailyQuota: 1000 },
      },
      recentCount: 60,
    });
    const guard = new ApiKeyGuard(prisma);
    const ctx = createContext({ apiKey: "nba_rate_limited" });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ApiException);
  });

  it("rejects when the daily quota is exceeded", async () => {
    const prisma = createMockPrisma({
      key: {
        isActive: true,
        consumer: { id: "c1", isActive: true, name: "Test", rateLimit: 60, dailyQuota: 1000 },
      },
      recentCount: 5,
      dailyCount: 1000,
    });
    const guard = new ApiKeyGuard(prisma);
    const ctx = createContext({ apiKey: "nba_quota_exceeded" });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ApiException);
  });

  it("allows a valid key within rate limit and quota", async () => {
    const prisma = createMockPrisma({
      key: {
        isActive: true,
        consumer: { id: "c1", isActive: true, name: "Test", rateLimit: 60, dailyQuota: 1000 },
      },
      recentCount: 5,
      dailyCount: 50,
    });
    const guard = new ApiKeyGuard(prisma);
    const ctx = createContext({ apiKey: "nba_valid_key" });

    expect(await guard.canActivate(ctx)).toBe(true);
  });
});
