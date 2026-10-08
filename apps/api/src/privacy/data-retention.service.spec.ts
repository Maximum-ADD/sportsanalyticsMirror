import { describe, expect, it, vi } from "vitest";
import { API_USAGE_RETENTION_IN_DAYS, DataRetentionService } from "./data-retention.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";

const NOW = new Date("2026-10-09T03:00:00.000Z");

function createPrisma() {
  return {
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 78 }) },
    verification: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    apiUsageLog: { deleteMany: vi.fn().mockResolvedValue({ count: 40 }) },
  };
}

describe("DataRetentionService", () => {
  it("deletes sessions and verifications that have expired", async () => {
    const prisma = createPrisma();

    await new DataRetentionService(prisma as unknown as PrismaService).deleteExpiredRecords(NOW);

    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: NOW } } });
    expect(prisma.verification.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: NOW } } });
  });

  it(`deletes API usage rows older than ${API_USAGE_RETENTION_IN_DAYS} days, and no newer ones`, async () => {
    const prisma = createPrisma();

    await new DataRetentionService(prisma as unknown as PrismaService).deleteExpiredRecords(NOW);

    expect(prisma.apiUsageLog.deleteMany).toHaveBeenCalledWith({
      where: { calledAt: { lt: new Date("2026-07-11T03:00:00.000Z") } },
    });
  });

  it("reports how many rows it deleted from each table", async () => {
    const service = new DataRetentionService(createPrisma() as unknown as PrismaService);

    await expect(service.deleteExpiredRecords(NOW)).resolves.toEqual({
      expiredSessions: 78,
      expiredVerifications: 2,
      oldApiUsageRows: 40,
    });
  });

  it("logs a failed scheduled run instead of crashing the process", async () => {
    const prisma = createPrisma();
    prisma.session.deleteMany.mockRejectedValue(new Error("database unavailable"));

    await expect(new DataRetentionService(prisma as unknown as PrismaService).runScheduledCleanup()).resolves.toBeUndefined();
  });
});
