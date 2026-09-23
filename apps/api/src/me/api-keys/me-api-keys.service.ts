import { HttpStatus, Injectable } from "@nestjs/common";
import type { ApiConsumer, ApiKey } from "@prisma/client";
import { generateApiKeyMaterial, type CreatedApiKey } from "../../common/api-keys.js";
import { ApiException } from "../../common/api-exception.js";
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

@Injectable()
export class MeApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

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
    return true;
  }

  // DELETE /v1/me/api-keys/:keyId/purge — hard delete for keys the user
  // doesn't want on their list at all, mirroring the admin-side purge.
  async deleteApiKey(userId: string, keyId: string): Promise<boolean> {
    const key = await this.findOwnKey(userId, keyId);
    if (!key) return false;

    await this.prisma.apiKey.delete({ where: { id: keyId } });
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
