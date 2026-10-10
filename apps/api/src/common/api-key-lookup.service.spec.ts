import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_KEY_CACHE_TTL_IN_MILLISECONDS, ApiKeyLookupService } from "./api-key-lookup.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";

const RAW_KEY = "nba_test_key";

function createKeyRow(overrides: { isActive?: boolean; consumerIsActive?: boolean; rateLimit?: number } = {}) {
  return {
    id: "key-1",
    keyHash: createHash("sha256").update(RAW_KEY).digest("hex"),
    isActive: overrides.isActive ?? true,
    consumer: {
      id: "c1",
      name: "Test",
      isActive: overrides.consumerIsActive ?? true,
      rateLimit: overrides.rateLimit ?? 60,
      dailyQuota: 1000,
    },
  };
}

function createService(keyRow: ReturnType<typeof createKeyRow> | null) {
  const findUnique = vi.fn().mockResolvedValue(keyRow);
  const prisma = { apiKey: { findUnique } } as unknown as PrismaService;
  return { service: new ApiKeyLookupService(prisma), findUnique };
}

describe("ApiKeyLookupService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("looks the key up by its SHA-256 hash, never the raw value", async () => {
    const { service, findUnique } = createService(createKeyRow());

    await service.findActiveKey(RAW_KEY);

    expect(findUnique).toHaveBeenCalledWith({
      where: { keyHash: createHash("sha256").update(RAW_KEY).digest("hex") },
      include: { consumer: true },
    });
  });

  it("returns the key id and the consumer's limits for an active key", async () => {
    const { service } = createService(createKeyRow());

    expect(await service.findActiveKey(RAW_KEY)).toEqual({
      keyId: "key-1",
      consumer: { id: "c1", name: "Test", rateLimit: 60, dailyQuota: 1000 },
    });
  });

  it("serves a repeat lookup from memory instead of the database", async () => {
    const { service, findUnique } = createService(createKeyRow());

    await service.findActiveKey(RAW_KEY);
    await service.findActiveKey(RAW_KEY);

    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("asks the database again once the cached entry has expired", async () => {
    const { service, findUnique } = createService(createKeyRow());

    await service.findActiveKey(RAW_KEY);
    vi.advanceTimersByTime(API_KEY_CACHE_TTL_IN_MILLISECONDS + 1);
    await service.findActiveKey(RAW_KEY);

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["unknown", null],
    ["revoked", createKeyRow({ isActive: false })],
    ["owned by a deactivated consumer", createKeyRow({ consumerIsActive: false })],
  ])("returns null for a key that is %s, and never caches the rejection", async (_label, keyRow) => {
    const { service, findUnique } = createService(keyRow);

    expect(await service.findActiveKey(RAW_KEY)).toBeNull();
    expect(await service.findActiveKey(RAW_KEY)).toBeNull();
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("re-reads an evicted key on its next request, so a revoke applies at once", async () => {
    const { service, findUnique } = createService(createKeyRow());
    await service.findActiveKey(RAW_KEY);

    service.evictKey("key-1");
    findUnique.mockResolvedValue(createKeyRow({ isActive: false }));

    expect(await service.findActiveKey(RAW_KEY)).toBeNull();
  });

  it("re-reads every key of an evicted consumer, picking up its new limits", async () => {
    const { service, findUnique } = createService(createKeyRow({ rateLimit: 60 }));
    await service.findActiveKey(RAW_KEY);

    service.evictConsumer("c1");
    findUnique.mockResolvedValue(createKeyRow({ rateLimit: 5 }));

    expect((await service.findActiveKey(RAW_KEY))?.consumer.rateLimit).toBe(5);
  });

  it("leaves other keys cached when one key or consumer is evicted", async () => {
    const { service, findUnique } = createService(createKeyRow());
    await service.findActiveKey(RAW_KEY);

    service.evictKey("some-other-key");
    service.evictConsumer("some-other-consumer");
    await service.findActiveKey(RAW_KEY);

    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
