import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";

// How long a resolved key is trusted before the database is asked again.
// Revoking, purging or editing through this API evicts the entry at once
// (see evictKey/evictConsumer), so this only bounds changes made around the
// API: a consumer deleted by an account-deletion cascade, or a row edited by
// hand in Postgres.
export const API_KEY_CACHE_TTL_IN_MILLISECONDS = 60_000;

/** The consumer behind a key, with the limits the rate limiter enforces. */
export interface ApiKeyConsumer {
  id: string;
  name: string;
  rateLimit: number;
  dailyQuota: number;
}

/** An active key, resolved from its raw value. */
export interface ResolvedApiKey {
  keyId: string;
  consumer: ApiKeyConsumer;
}

interface CachedApiKey {
  resolvedKey: ResolvedApiKey;
  expiresAtEpochMs: number;
}

/**
 * Resolves a raw X-API-Key value to its active key and consumer, caching
 * the answer in memory so a repeat request costs no database round trip.
 *
 * The site's own proxy sends one key on every signed-out request, so before
 * this cache every public read paid a key lookup over the Supabase pooler
 * before the response cache was ever consulted.
 *
 * Only active keys are cached. An unknown, revoked or deactivated key is
 * looked up every time, so a newly created key works on its first request
 * and a rejected one never lingers as a cached "yes".
 */
@Injectable()
export class ApiKeyLookupService {
  private readonly cachedKeysByHash = new Map<string, CachedApiKey>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds the active key matching a raw key value.
   *
   * @param rawKey - the X-API-Key header value, exactly as sent.
   * @returns the key and its consumer, or null when the key is unknown, the
   *   key is revoked, or its consumer is deactivated.
   */
  async findActiveKey(rawKey: string): Promise<ResolvedApiKey | null> {
    const keyHash = hashApiKey(rawKey);
    const cachedKey = this.cachedKeysByHash.get(keyHash);
    if (cachedKey && cachedKey.expiresAtEpochMs > Date.now()) return cachedKey.resolvedKey;

    this.cachedKeysByHash.delete(keyHash);
    const resolvedKey = await this.loadActiveKey(keyHash);
    if (resolvedKey) {
      this.cachedKeysByHash.set(keyHash, {
        resolvedKey,
        expiresAtEpochMs: Date.now() + API_KEY_CACHE_TTL_IN_MILLISECONDS,
      });
    }
    return resolvedKey;
  }

  /** Forgets one key, so its next request re-reads it (call after a revoke or purge). */
  evictKey(keyId: string): void {
    for (const [keyHash, cachedKey] of this.cachedKeysByHash) {
      if (cachedKey.resolvedKey.keyId === keyId) this.cachedKeysByHash.delete(keyHash);
    }
  }

  /**
   * Forgets every key of one consumer (call after its limits change, it is
   * deactivated, or it is deleted), so new limits apply on the next request.
   */
  evictConsumer(consumerId: string): void {
    for (const [keyHash, cachedKey] of this.cachedKeysByHash) {
      if (cachedKey.resolvedKey.consumer.id === consumerId) this.cachedKeysByHash.delete(keyHash);
    }
  }

  private async loadActiveKey(keyHash: string): Promise<ResolvedApiKey | null> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { consumer: true },
    });
    if (!apiKey || !apiKey.isActive || !apiKey.consumer.isActive) return null;

    const { consumer } = apiKey;
    return {
      keyId: apiKey.id,
      consumer: {
        id: consumer.id,
        name: consumer.name,
        rateLimit: consumer.rateLimit,
        dailyQuota: consumer.dailyQuota,
      },
    };
  }
}

/** SHA-256 of a raw key: the only form a key is ever stored or compared in. */
function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}
