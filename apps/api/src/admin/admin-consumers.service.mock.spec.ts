import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminConsumersService } from "./admin-consumers.service.js";

function createMockPrisma() {
  return {
    apiConsumer: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "c1" }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    apiKey: {
      create: vi.fn().mockResolvedValue({ id: "k1", label: null, createdAt: new Date() }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
  } as any;
}

describe("AdminConsumersService", () => {
  let service: AdminConsumersService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AdminConsumersService(prisma);
  });

  describe("listConsumers", () => {
    it("returns paginated list of consumers", async () => {
      const result = await service.listConsumers({});
      expect(result.data).toEqual([]);
      expect(result.page).toBe(1);
    });

    it("includes the owner and marks user-owned consumers as USER kind", async () => {
      prisma.apiConsumer.findMany.mockResolvedValue([
        {
          id: "c-user",
          name: "Owen",
          contactEmail: "owen@example.com",
          rateLimit: 60,
          dailyQuota: 5000,
          isActive: true,
          createdAt: new Date("2026-09-17T00:00:00.000Z"),
          userId: "u1",
          user: { id: "u1", name: "Owen", email: "owen@example.com" },
          keys: [],
          _count: { usageLog: 3 },
        },
        {
          id: "c-external",
          name: "ESPN Integration",
          contactEmail: "api@espn.com",
          rateLimit: 100,
          dailyQuota: 10000,
          isActive: true,
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
          userId: null,
          user: null,
          keys: [],
          _count: { usageLog: 900 },
        },
      ]);

      const result = await service.listConsumers({});

      expect(result.data[0].kind).toBe("USER");
      expect(result.data[0].user).toEqual({ id: "u1", name: "Owen", email: "owen@example.com" });
      expect(result.data[1].kind).toBe("EXTERNAL");
      expect(result.data[1].user).toBeNull();
    });
  });

  describe("createConsumer", () => {
    it("creates a consumer with parsed body", async () => {
      const result = await service.createConsumer({ name: "TestApp" });
      expect(prisma.apiConsumer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: "TestApp" } })
      );
      expect(result).toEqual({ id: "c1" });
    });

    it("throws when body is invalid", async () => {
      await expect(service.createConsumer(null)).rejects.toThrow("must be an object");
    });
  });

  describe("updateConsumer", () => {
    it("returns null when consumer does not exist", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue(null);
      const result = await service.updateConsumer("nonexistent", { name: "X" });
      expect(result).toBeNull();
    });

    it("updates when consumer exists", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue({ id: "c1" });
      await service.updateConsumer("c1", { name: "NewName", isActive: true });
      expect(prisma.apiConsumer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "c1" },
          data: expect.objectContaining({ name: "NewName", isActive: true }),
        })
      );
    });

    it("applies contactEmail null to clear it", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue({ id: "c1" });
      await service.updateConsumer("c1", { contactEmail: null });
      const data = prisma.apiConsumer.update.mock.calls[0][0].data;
      expect(data.contactEmail).toBeNull();
    });
  });

  describe("createApiKey", () => {
    it("returns null when consumer does not exist", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue(null);
      const result = await service.createApiKey("nonexistent");
      expect(result).toBeNull();
    });

    it("creates a key and returns the raw key", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue({ id: "c1" });
      const result = await service.createApiKey("c1");
      expect(result).not.toBeNull();
      expect(result!.rawKey).toMatch(/^nba_/);
      expect(prisma.apiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ consumerId: "c1" }),
        })
      );
    });

    it("passes label through when provided", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue({ id: "c1" });
      await service.createApiKey("c1", "test-label");
      const data = prisma.apiKey.create.mock.calls[0][0].data;
      expect(data.label).toBe("test-label");
    });

    it("sets label to null when not provided", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue({ id: "c1" });
      await service.createApiKey("c1");
      const data = prisma.apiKey.create.mock.calls[0][0].data;
      expect(data.label).toBeNull();
    });
  });

  describe("revokeApiKey", () => {
    it("returns false when key does not exist", async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);
      const result = await service.revokeApiKey("c1", "nonexistent");
      expect(result).toBe(false);
    });

    it("marks the key as inactive and returns true", async () => {
      prisma.apiKey.findFirst.mockResolvedValue({ id: "k1" });
      const result = await service.revokeApiKey("c1", "k1");
      expect(result).toBe(true);
      expect(prisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "k1" },
          data: { isActive: false },
        })
      );
    });
  });

  describe("deleteApiKey", () => {
    it("returns false when key does not exist", async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);
      const result = await service.deleteApiKey("c1", "nonexistent");
      expect(result).toBe(false);
      expect(prisma.apiKey.delete).not.toHaveBeenCalled();
    });

    it("deletes the key and returns true", async () => {
      prisma.apiKey.findFirst.mockResolvedValue({ id: "k1" });
      const result = await service.deleteApiKey("c1", "k1");
      expect(result).toBe(true);
      expect(prisma.apiKey.delete).toHaveBeenCalledWith({ where: { id: "k1" } });
    });
  });

  describe("deleteConsumer", () => {
    it("returns false when consumer does not exist", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue(null);
      const result = await service.deleteConsumer("nonexistent");
      expect(result).toBe(false);
      expect(prisma.apiConsumer.delete).not.toHaveBeenCalled();
    });

    it("deletes the consumer and returns true", async () => {
      prisma.apiConsumer.findUnique.mockResolvedValue({ id: "c1" });
      const result = await service.deleteConsumer("c1");
      expect(result).toBe(true);
      expect(prisma.apiConsumer.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
    });
  });
});
