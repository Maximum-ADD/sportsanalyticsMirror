import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeApiKeysService } from "./me-api-keys.service.js";

function createMockPrisma() {
  return {
    apiConsumer: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1" }),
      create: vi.fn().mockResolvedValue({ id: "c1" }),
    },
    apiKey: {
      create: vi.fn().mockResolvedValue({ id: "k1", label: null, createdAt: new Date("2026-09-17T00:00:00.000Z") }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ name: "Owen", email: "owen@example.com" }),
    },
    apiUsageLog: {
      groupBy: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
  } as any;
}

function createMockApiKeyLookup() {
  return { evictKey: vi.fn(), evictConsumer: vi.fn() };
}

describe("MeApiKeysService", () => {
  let service: MeApiKeysService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let apiKeyLookup: ReturnType<typeof createMockApiKeyLookup>;

  beforeEach(() => {
    prisma = createMockPrisma();
    apiKeyLookup = createMockApiKeyLookup();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
    service = new MeApiKeysService(prisma, apiKeyLookup as any);
  });

  describe("listMyApiKeys", () => {
    it("returns an empty view when the user has no personal consumer yet", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue(null);

      const result = await service.listMyApiKeys("u1");

      expect(result).toEqual({ consumer: null, keys: [] });
      expect(prisma.apiConsumer.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "u1" } })
      );
    });

    it("returns the consumer's limits, usage and keys when present", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue({
        id: "c1",
        rateLimit: 60,
        dailyQuota: 5000,
        _count: { usageLog: 42 },
        keys: [{ id: "k1" }, { id: "k2" }],
      });

      const result = await service.listMyApiKeys("u1");

      expect(result).toEqual({
        consumer: { id: "c1", rateLimit: 60, dailyQuota: 5000, usageCount: 42 },
        keys: [{ id: "k1" }, { id: "k2" }],
      });
    });
  });

  describe("getMyApiUsageBreakdown", () => {
    it("returns null when the user has no personal consumer yet", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue(null);

      const result = await service.getMyApiUsageBreakdown("u1");

      expect(result).toBeNull();
      expect(prisma.apiUsageLog.groupBy).not.toHaveBeenCalled();
    });

    it("returns the endpoint and daily breakdowns scoped to the user's consumer", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue({ id: "c1" });
      prisma.apiUsageLog.groupBy.mockResolvedValue([
        { endpoint: "GET /v1/players", _count: { _all: 30 } },
        { endpoint: "GET /v1/games", _count: { _all: 12 } },
      ]);
      prisma.$queryRaw.mockResolvedValue([
        { date: new Date("2026-10-01T00:00:00.000Z"), count: 5n },
        { date: new Date("2026-10-02T00:00:00.000Z"), count: 7n },
      ]);

      const result = await service.getMyApiUsageBreakdown("u1");

      expect(prisma.apiUsageLog.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { consumerId: "c1" } })
      );
      expect(result).toEqual({
        byEndpoint: [
          { endpoint: "GET /v1/players", count: 30 },
          { endpoint: "GET /v1/games", count: 12 },
        ],
        byDay: [
          { date: "2026-10-01", count: 5 },
          { date: "2026-10-02", count: 7 },
        ],
      });
    });
  });

  describe("createApiKey", () => {
    it("reuses the existing personal consumer without creating a new one", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue({ id: "c1" });

      const result = await service.createApiKey("u1");

      expect(prisma.apiConsumer.create).not.toHaveBeenCalled();
      expect(prisma.apiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ consumerId: "c1", label: null }),
        })
      );
      expect(result.rawKey).toMatch(/^nba_/);
      expect(result.id).toBe("k1");
    });

    it("provisions the personal consumer on first use, named after the owner", async () => {
      const result = await service.createApiKey("u1");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "u1" },
        select: { name: true, email: true },
      });
      expect(prisma.apiConsumer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Owen",
          contactEmail: "owen@example.com",
          userId: "u1",
          rateLimit: 60,
          dailyQuota: 5000,
        }),
      });
      expect(result.rawKey).toMatch(/^nba_/);
    });

    it("falls back to the email when the user has no name", async () => {
      prisma.user.findUnique.mockResolvedValue({ name: "", email: "owen@example.com" });

      await service.createApiKey("u1");

      expect(prisma.apiConsumer.create.mock.calls[0][0].data.name).toBe("owen@example.com");
    });

    it("stores the label when provided and null for a blank one", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue({ id: "c1" });

      await service.createApiKey("u1", "laptop");
      expect(prisma.apiKey.create.mock.calls[0][0].data.label).toBe("laptop");

      await service.createApiKey("u1", "   ");
      expect(prisma.apiKey.create.mock.calls[1][0].data.label).toBeNull();
    });

    it("throws NOT_FOUND when the user row is gone", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.createApiKey("u1")).rejects.toMatchObject({ status: 404 });
      expect(prisma.apiKey.create).not.toHaveBeenCalled();
    });

    it("reads back the winner's row when two first-use requests race", async () => {
      prisma.apiConsumer.create.mockRejectedValue({ code: "P2002" });

      const key = await service.createApiKey("u1");

      expect(prisma.apiConsumer.findUniqueOrThrow).toHaveBeenCalledWith({ where: { userId: "u1" } });
      expect(prisma.apiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ consumerId: "c1" }) })
      );
      expect(key.id).toBe("k1");
    });

    it("propagates unexpected consumer-creation errors", async () => {
      prisma.apiConsumer.create.mockRejectedValue(new Error("connection reset"));

      await expect(service.createApiKey("u1")).rejects.toThrow("connection reset");
    });
  });

  describe("revokeApiKey", () => {
    it("returns false when the key does not belong to the user", async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);

      const result = await service.revokeApiKey("u1", "k9");

      expect(result).toBe(false);
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
      expect(apiKeyLookup.evictKey).not.toHaveBeenCalled();
    });

    it("scopes the lookup through the consumer ownership chain", async () => {
      prisma.apiKey.findFirst.mockResolvedValue({ id: "k1" });

      await service.revokeApiKey("u1", "k1");

      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
        where: { id: "k1", consumer: { userId: "u1" } },
      });
    });

    it("marks the key inactive and returns true", async () => {
      prisma.apiKey.findFirst.mockResolvedValue({ id: "k1" });

      const result = await service.revokeApiKey("u1", "k1");

      expect(result).toBe(true);
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: "k1" },
        data: { isActive: false },
      });
      // Evicted from the guard's key cache, so it stops working on its very
      // next request instead of when the cache entry would have expired.
      expect(apiKeyLookup.evictKey).toHaveBeenCalledWith("k1");
    });
  });

  describe("deleteApiKey", () => {
    it("returns false when the key does not belong to the user", async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);

      const result = await service.deleteApiKey("u1", "k9");

      expect(result).toBe(false);
      expect(prisma.apiKey.delete).not.toHaveBeenCalled();
    });

    it("hard-deletes the key and returns true", async () => {
      prisma.apiKey.findFirst.mockResolvedValue({ id: "k1" });

      const result = await service.deleteApiKey("u1", "k1");

      expect(result).toBe(true);
      expect(prisma.apiKey.delete).toHaveBeenCalledWith({ where: { id: "k1" } });
      expect(apiKeyLookup.evictKey).toHaveBeenCalledWith("k1");
    });
  });
});
