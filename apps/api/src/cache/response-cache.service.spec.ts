import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCacheKey, ResponseCacheService } from "./response-cache.service.js";

const ONE_MINUTE_MS = 60_000;

describe("ResponseCacheService", () => {
  let cache: ResponseCacheService;

  beforeEach(() => {
    // Enabled explicitly: the default is off under Vitest, so the e2e specs
    // never read a previous test's cached rows.
    cache = new ResponseCacheService({ enabled: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads on a miss and serves the stored value on the next call", async () => {
    const load = vi.fn().mockResolvedValue({ answer: 42 });

    const first = await cache.getOrLoad("key", ONE_MINUTE_MS, load);
    const second = await cache.getOrLoad("key", ONE_MINUTE_MS, load);

    expect(first).toEqual({ answer: 42 });
    expect(second).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps different keys apart", async () => {
    await cache.getOrLoad("a", ONE_MINUTE_MS, () => Promise.resolve("value-a"));
    const valueB = await cache.getOrLoad("b", ONE_MINUTE_MS, () => Promise.resolve("value-b"));

    expect(valueB).toBe("value-b");
  });

  it("reloads once the TTL has passed", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValueOnce("stale").mockResolvedValueOnce("fresh");

    await cache.getOrLoad("key", ONE_MINUTE_MS, load);
    vi.advanceTimersByTime(ONE_MINUTE_MS + 1);
    const value = await cache.getOrLoad("key", ONE_MINUTE_MS, load);

    expect(value).toBe("fresh");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one load between concurrent misses on the same key", async () => {
    let resolveLoad: (value: string) => void = () => {};
    const load = vi.fn(() => new Promise<string>((resolve) => (resolveLoad = resolve)));

    const pendingValues = Promise.all([
      cache.getOrLoad("key", ONE_MINUTE_MS, load),
      cache.getOrLoad("key", ONE_MINUTE_MS, load),
      cache.getOrLoad("key", ONE_MINUTE_MS, load),
    ]);
    await Promise.resolve();
    resolveLoad("shared");

    expect(await pendingValues).toEqual(["shared", "shared", "shared"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not store a rejected load, so the next call retries", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("pooler timeout")).mockResolvedValueOnce("recovered");

    await expect(cache.getOrLoad("key", ONE_MINUTE_MS, load)).rejects.toThrow("pooler timeout");
    const value = await cache.getOrLoad("key", ONE_MINUTE_MS, load);

    expect(value).toBe("recovered");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not stay stuck on a load that throws synchronously", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => {
        throw new Error("thrown before returning a promise");
      })
      .mockResolvedValueOnce("recovered");

    await expect(cache.getOrLoad("key", ONE_MINUTE_MS, load)).rejects.toThrow("thrown before returning a promise");
    expect(await cache.getOrLoad("key", ONE_MINUTE_MS, load)).toBe("recovered");
  });

  it("does not store a null result, so a not-found doesn't stick", async () => {
    const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "now-ingested" });

    expect(await cache.getOrLoad("key", ONE_MINUTE_MS, load)).toBeNull();
    expect(await cache.getOrLoad("key", ONE_MINUTE_MS, load)).toEqual({ id: "now-ingested" });
  });

  it("invalidates every key under a prefix and leaves the rest", async () => {
    const leaderboardLoad = vi.fn().mockResolvedValue("board");
    const teamsLoad = vi.fn().mockResolvedValue("teams");
    await cache.getOrLoad("analytics:leaderboard-users:[]", ONE_MINUTE_MS, leaderboardLoad);
    await cache.getOrLoad("teams:elo:[]", ONE_MINUTE_MS, teamsLoad);

    cache.invalidate("analytics:leaderboard");
    await cache.getOrLoad("analytics:leaderboard-users:[]", ONE_MINUTE_MS, leaderboardLoad);
    await cache.getOrLoad("teams:elo:[]", ONE_MINUTE_MS, teamsLoad);

    expect(leaderboardLoad).toHaveBeenCalledTimes(2);
    expect(teamsLoad).toHaveBeenCalledTimes(1);
  });

  it("does not store a load that was invalidated while still in flight", async () => {
    let resolveLoad: (value: string) => void = () => {};
    const inFlightLoad = vi.fn(() => new Promise<string>((resolve) => (resolveLoad = resolve)));

    const pendingValue = cache.getOrLoad("key", ONE_MINUTE_MS, inFlightLoad);
    await Promise.resolve();
    cache.invalidate("key");
    resolveLoad("pre-write value");

    expect(await pendingValue).toBe("pre-write value");
    const reloaded = await cache.getOrLoad("key", ONE_MINUTE_MS, () => Promise.resolve("post-write value"));
    expect(reloaded).toBe("post-write value");
  });

  it("evicts the oldest entry once maxEntries is exceeded", async () => {
    const boundedCache = new ResponseCacheService({ enabled: true, maxEntries: 2 });
    const firstLoad = vi.fn().mockResolvedValue("first");

    await boundedCache.getOrLoad("first", ONE_MINUTE_MS, firstLoad);
    await boundedCache.getOrLoad("second", ONE_MINUTE_MS, () => Promise.resolve("second"));
    await boundedCache.getOrLoad("third", ONE_MINUTE_MS, () => Promise.resolve("third"));
    await boundedCache.getOrLoad("first", ONE_MINUTE_MS, firstLoad);

    expect(firstLoad).toHaveBeenCalledTimes(2);
  });

  it("passes every call straight through when disabled", async () => {
    const disabledCache = new ResponseCacheService({ enabled: false });
    const load = vi.fn().mockResolvedValue("value");

    await disabledCache.getOrLoad("key", ONE_MINUTE_MS, load);
    await disabledCache.getOrLoad("key", ONE_MINUTE_MS, load);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("is disabled by default under Vitest", async () => {
    const defaultCache = new ResponseCacheService();
    const load = vi.fn().mockResolvedValue("value");

    await defaultCache.getOrLoad("key", ONE_MINUTE_MS, load);
    await defaultCache.getOrLoad("key", ONE_MINUTE_MS, load);

    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("buildCacheKey", () => {
  it("prefixes the JSON-encoded parts with the namespace", () => {
    expect(buildCacheKey("games:list", ["upcoming", 1, undefined])).toBe('games:list:["upcoming",1,null]');
  });

  it("cannot collide when a part itself contains the separator", () => {
    expect(buildCacheKey("players", ["a:b", "c"])).not.toBe(buildCacheKey("players", ["a", "b:c"]));
  });
});
