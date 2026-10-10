import { HttpStatus, Injectable } from "@nestjs/common";
import type { ApiConsumer, ApiKey } from "@prisma/client";
import { generateApiKeyMaterial, type CreatedApiKey } from "../../common/api-keys.js";
import { ApiException } from "../../common/api-exception.js";
import { ApiKeyLookupService } from "../../common/api-key-lookup.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

// Personal keys get a tighter budget than admin-created external consumers
// (which default to 100/min and 10000/day): a user's scripts all share one
// consumer, and the point of the consumer-level rate limit is that one
// runaway loop can't exhaust the platform for everyone else. An admin can
// still raise an individual user's limits through the consumer PATCH
// endpoint when there's a real need for more.
const PERSONAL_RATE_LIMIT_PER_MINUTE = 60;
const PERSONAL_DAILY_QUOTA = 5000;

// The signed-in user's view of their own API access: their personal
// consumer's limits and lifetime usage alongside the keys themselves.
// consumer is null until the first key is created — the frontend renders
// that as "no keys yet" rather than a loading or error state.
export interface MyApiKeysView {
  consumer: {
    id: string;
    rateLimit: number;
    dailyQuota: number;
    usageCount: number;
  } | null;
  keys: ApiKey[];
}

// Breakdown of one consumer's logged requests: by endpoint (lifetime, most
// called first) and by day (recent window, oldest first — a chart reads
// left to right). Both come from the same ApiUsageLog the total count
// already does, so a key owner can see what the one number is made of
// instead of just its total.
export interface MyApiUsageBreakdown {
  byEndpoint: Array<{ endpoint: string; count: number }>;
  byDay: Array<{ date: string; count: number }>;
}

const USAGE_BREAKDOWN_WINDOW_DAYS = 14;

@Injectable()
export class MeApiKeysService {
  // apiKeyLookup caches resolved keys for ApiKeyGuard; revoking or
  // purging evicts the key so it stops working on its very next request.
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeyLookup: ApiKeyLookupService,
  ) {}

  // GET /v1/me/api-keys — the caller's keys plus their consumer's limits
  // and usage, or an empty view when they've never created a key.
  async listMyApiKeys(userId: string): Promise<MyApiKeysView> {
    const consumer = await this.prisma.apiConsumer.findUnique({
      where: { userId },
      include: {
        keys: { orderBy: { createdAt: "desc" } },
        _count: { select: { usageLog: true } },
      },
    });

    if (!consumer) {
      return { consumer: null, keys: [] };
    }

    return {
      consumer: {
        id: consumer.id,
        rateLimit: consumer.rateLimit,
        dailyQuota: consumer.dailyQuota,
        usageCount: consumer._count.usageLog,
      },
      keys: consumer.keys,
    };
  }

  // GET /v1/me/api-keys/usage — the caller's own breakdown of the total
  // listMyApiKeys already returns, by endpoint and by day. Returns null
  // when the caller has no consumer yet (same "no keys yet" case as the
  // main view), rather than an empty-but-present breakdown.
  async getMyApiUsageBreakdown(userId: string): Promise<MyApiUsageBreakdown | null> {
    const consumer = await this.prisma.apiConsumer.findUnique({ where: { userId }, select: { id: true } });
    if (!consumer) return null;

    const [byEndpoint, byDay] = await Promise.all([
      this.prisma.apiUsageLog.groupBy({
        by: ["endpoint"],
        where: { consumerId: consumer.id },
        _count: { _all: true },
        orderBy: { _count: { endpoint: "desc" } },
      }),
      this.prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
        SELECT date_trunc('day', "calledAt") AS date, count(*)::bigint AS count
        FROM "ApiUsageLog"
        WHERE "consumerId" = ${consumer.id}
          AND "calledAt" >= now() - (${USAGE_BREAKDOWN_WINDOW_DAYS}::text || ' days')::interval
        GROUP BY date
        ORDER BY date ASC
      `,
    ]);

    return {
      byEndpoint: byEndpoint.map((row) => ({ endpoint: row.endpoint, count: row._count._all })),
      byDay: byDay.map((row) => ({ date: row.date.toISOString().slice(0, 10), count: Number(row.count) })),
    };
  }

  // POST /v1/me/api-keys — mint a key for the caller. Creates their
  // personal consumer on first use; the raw key is returned exactly once.
  async createApiKey(userId: string, label?: string): Promise<CreatedApiKey> {
    const consumer = await this.ensurePersonalConsumer(userId);
    const { rawKey, keyHash } = generateApiKeyMaterial();

    const key = await this.prisma.apiKey.create({
      data: {
        consumerId: consumer.id,
        keyHash,
        // Trimmed defensively here too (not just by the controller's zod
        // schema) so a whitespace-only label never reaches the database.
        label: label?.trim() || null,
      },
    });

    return {
      id: key.id,
      label: key.label,
      rawKey,
      createdAt: key.createdAt,
    };
  }

  // DELETE /v1/me/api-keys/:keyId — soft-revoke. The key stays in the list
  // (inactive) so its history is visible, exactly like the admin-side
  // revoke.
  async revokeApiKey(userId: string, keyId: string): Promise<boolean> {
    const key = await this.findOwnKey(userId, keyId);
    if (!key) return false;

    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });
    this.apiKeyLookup.evictKey(keyId);
    return true;
  }

  // DELETE /v1/me/api-keys/:keyId/purge — hard delete for keys the user
  // doesn't want on their list at all, mirroring the admin-side purge.
  async deleteApiKey(userId: string, keyId: string): Promise<boolean> {
    const key = await this.findOwnKey(userId, keyId);
    if (!key) return false;

    await this.prisma.apiKey.delete({ where: { id: keyId } });
    this.apiKeyLookup.evictKey(keyId);
    return true;
  }

  // Every key lookup is scoped through the consumer ownership chain
  // (key → consumer → userId), so a user can never touch — or even
  // confirm the existence of — another user's key by guessing a uuid.
  private async findOwnKey(userId: string, keyId: string) {
    return this.prisma.apiKey.findFirst({
      where: { id: keyId, consumer: { userId } },
    });
  }

  // The caller's personal consumer, created on first use. userId is
  // @unique on ApiConsumer, so two simultaneous first-use requests race on
  // the same row — the loser of that race catches the unique-constraint
  // violation and reads back the winner's row instead of 500ing.
  private async ensurePersonalConsumer(userId: string): Promise<ApiConsumer> {
    const existing = await this.prisma.apiConsumer.findUnique({ where: { userId } });
    if (existing) return existing;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "User not found");
    }

    try {
      return await this.prisma.apiConsumer.create({
        data: {
          // Named after the owner so the admin consumer list is readable
          // even without joining the user relation.
          name: user.name || user.email,
          contactEmail: user.email,
          userId,
          rateLimit: PERSONAL_RATE_LIMIT_PER_MINUTE,
          dailyQuota: PERSONAL_DAILY_QUOTA,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return await this.prisma.apiConsumer.findUniqueOrThrow({ where: { userId } });
      }
      throw error;
    }
  }
}

// Prisma throws a PrismaClientKnownRequestError with code "P2002" for a
// unique constraint violation. Narrow-checked structurally (duck-typed)
// rather than importing the Prisma error class, matching how MeController
// handles the same race on username updates.
function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
