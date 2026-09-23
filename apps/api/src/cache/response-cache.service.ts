import { Inject, Injectable, Optional } from "@nestjs/common";

// Injection token for overriding the cache's defaults. Only the unit spec
// provides it; the app relies on the defaults.
export const RESPONSE_CACHE_OPTIONS = Symbol("RESPONSE_CACHE_OPTIONS");

export interface ResponseCacheOptions {
  // Whether values are stored at all. Defaults to on, except under Vitest or
  // with API_CACHE_DISABLED=true (see isCacheEnabledByDefault).
  enabled?: boolean;
  // The most entries held at once before the oldest is evicted.
  maxEntries?: number;
}

// Enough for every public list/detail a busy session touches, while keeping
// memory bounded on Render's 512 MB free-tier instance.
const DEFAULT_MAX_ENTRIES = 500;

interface CacheEntry {
  value: unknown;
  expiresAtEpochMs: number;
}

/**
 * Whether caching is on when no explicit option is given.
 *
 * Off under Vitest: the e2e specs truncate and reseed one shared database
 * between tests, and a cached read from a previous test would leak into the
 * next. Checking VITEST here, rather than a variable in .env.test, keeps CI
 * (which writes its own .env.test) working without changes.
 */
function isCacheEnabledByDefault(): boolean {
  return !process.env.VITEST && process.env.API_CACHE_DISABLED !== "true";
}

/**
 * Builds a cache key from a namespace and the parameters that shape the read.
 *
 * @param namespace - a colon-separated prefix such as "players:leaders". Keys
 *   are invalidated by prefix, so related reads should share one.
 * @param parts - every input the cached value depends on. JSON-encoded, so a
 *   search term that contains a colon can't collide with another key.
 */
export function buildCacheKey(namespace: string, parts: unknown[] = []): string {
  return `${namespace}:${JSON.stringify(parts)}`;
}

/**
 * An in-process, TTL-based cache for database reads that don't depend on who
 * is asking.
 *
 * In-memory rather than Redis because the API runs as one Render instance.
 * Nothing needs sharing across processes, and a network cache would add back
 * the round trip this exists to remove. The cache starts empty on every boot,
 * including each free-tier spin-up, which only costs one cold read per key.
 *
 * Cached values are handed out by reference. Callers must treat them as
 * read-only: mutating one would change what the next request receives.
 */
@Injectable()
export class ResponseCacheService {
  private readonly entriesByKey = new Map<string, CacheEntry>();
  private readonly inFlightLoadsByKey = new Map<string, Promise<unknown>>();
  private readonly isEnabled: boolean;
  private readonly maxEntries: number;

  constructor(@Optional() @Inject(RESPONSE_CACHE_OPTIONS) options: ResponseCacheOptions = {}) {
    this.isEnabled = options.enabled ?? isCacheEnabledByDefault();
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /**
   * Returns the cached value for `key`, loading and storing it on a miss.
   *
   * @param key - from buildCacheKey.
   * @param ttlMs - how long a freshly loaded value stays valid (see cache-ttl.ts).
   * @param load - the database read to run on a miss.
   * @returns the cached or freshly loaded value.
   *
   * Concurrent misses on one key share a single `load` call. Pages fire
   * identical requests in parallel, and on a cold key each would otherwise
   * query the database separately.
   *
   * A rejected load is not stored, so the next call retries. A null or
   * undefined result is not stored either, so a "not found" (typically a 404)
   * doesn't stick after the row is ingested.
   */
  getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    if (!this.isEnabled) return load();

    const freshEntry = this.readFreshEntry(key);
    if (freshEntry) return Promise.resolve(freshEntry.value as T);

    const inFlightLoad = this.inFlightLoadsByKey.get(key);
    if (inFlightLoad) return inFlightLoad as Promise<T>;

    return this.startLoad(key, ttlMs, load);
  }

  /**
   * Drops every cached value, and every load still in flight, whose key
   * starts with `keyPrefix`.
   *
   * @param keyPrefix - usually a namespace passed to buildCacheKey.
   *
   * An in-flight load is only detached, not cancelled. Its caller still gets
   * its result, but that result is never stored, so a read that started before
   * a write can't put pre-write data back into the cache.
   */
  invalidate(keyPrefix: string): void {
    for (const key of [...this.entriesByKey.keys()]) {
      if (key.startsWith(keyPrefix)) this.entriesByKey.delete(key);
    }
    for (const key of [...this.inFlightLoadsByKey.keys()]) {
      if (key.startsWith(keyPrefix)) this.inFlightLoadsByKey.delete(key);
    }
  }

  // The entry for `key` if it hasn't expired. An expired entry is deleted on
  // the way out, so the map never holds dead values past their next read.
  private readFreshEntry(key: string): CacheEntry | undefined {
    const entry = this.entriesByKey.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtEpochMs > Date.now()) return entry;
    this.entriesByKey.delete(key);
    return undefined;
  }

  // Runs `load` once and registers it as this key's in-flight load. The result
  // is stored only if this load is still the registered one when it settles,
  // which is false if invalidate() detached it mid-flight.
  //
  // `load` starts from a resolved promise, not a direct call, so it always
  // runs after the registration below. A load that throws synchronously
  // otherwise settles before it is registered, and its rejection would then
  // stay cached as the key's in-flight load.
  private startLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const isStillRegistered = () => this.inFlightLoadsByKey.get(key) === pendingLoad;

    const pendingLoad: Promise<T> = Promise.resolve()
      .then(load)
      .then((value) => {
        if (value !== null && value !== undefined && isStillRegistered()) {
          this.storeEntry(key, value, ttlMs);
        }
        return value;
      })
      .finally(() => {
        if (isStillRegistered()) this.inFlightLoadsByKey.delete(key);
      });

    this.inFlightLoadsByKey.set(key, pendingLoad);
    return pendingLoad;
  }

  // Writes an entry, then evicts the oldest ones past maxEntries. Deleting
  // before setting moves a rewritten key to the back of Map insertion order,
  // so eviction always removes the least recently written values.
  private storeEntry(key: string, value: unknown, ttlMs: number): void {
    this.entriesByKey.delete(key);
    this.entriesByKey.set(key, { value, expiresAtEpochMs: Date.now() + ttlMs });

    while (this.entriesByKey.size > this.maxEntries) {
      const oldestKey = this.entriesByKey.keys().next().value;
      if (oldestKey === undefined) break;
      this.entriesByKey.delete(oldestKey);
    }
  }
}
