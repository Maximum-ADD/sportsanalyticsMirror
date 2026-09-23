import { Injectable } from "@nestjs/common";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { generateApiKeyMaterial, type CreatedApiKey } from "../common/api-keys.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ApiConsumer, ApiKey } from "@prisma/client";

// One consumer with aggregated usage stats — the admin list shows
// request counts alongside the consumer details so the admin can spot
// heavy users without a separate query.
//
// kind/user differentiate the two consumer populations sharing this table:
// USER — auto-provisioned personal consumer owned by a signed-in user
// (ApiConsumer.userId set, user populated); EXTERNAL — admin-created
// consumer for a third-party integration (userId null, user null).
export interface ConsumerWithStats extends ApiConsumer {
  kind: "USER" | "EXTERNAL";
  user: { id: string; name: string; email: string } | null;
  keys: ApiKey[];
  _count: { usageLog: number };
}

// Re-exported so existing importers (AdminConsumersController) keep working
// now that the interface lives beside the shared key-generation helper.
export type { CreatedApiKey };

function parseConsumerBody(body: unknown): {
  name: string;
  contactEmail?: string;
  rateLimit?: number;
  dailyQuota?: number;
} {
  if (typeof body !== "object" || body === null) {
    throw new Error("Request body must be an object");
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.name !== "string" || raw.name.trim().length === 0) {
    throw new Error("name is required and must be a non-empty string");
  }

  const result: {
    name: string;
    contactEmail?: string;
    rateLimit?: number;
    dailyQuota?: number;
  } = { name: raw.name.trim() };

  if (typeof raw.contactEmail === "string" && raw.contactEmail.trim().length > 0) {
    result.contactEmail = raw.contactEmail.trim();
  }
  if (typeof raw.rateLimit === "number" && raw.rateLimit > 0) {
    result.rateLimit = Math.floor(raw.rateLimit);
  }
  if (typeof raw.dailyQuota === "number" && raw.dailyQuota > 0) {
    result.dailyQuota = Math.floor(raw.dailyQuota);
  }

  return result;
}

function parseUpdateConsumerBody(body: unknown): {
  name?: string;
  contactEmail?: string | null;
  rateLimit?: number;
  dailyQuota?: number;
  isActive?: boolean;
} {
  if (typeof body !== "object" || body === null) {
    throw new Error("Request body must be an object");
  }
  const raw = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (typeof raw.name === "string" && raw.name.trim().length > 0) {
    patch.name = raw.name.trim();
  }
  if (raw.contactEmail === null || (typeof raw.contactEmail === "string")) {
    patch.contactEmail = raw.contactEmail === null ? null : raw.contactEmail.trim() || null;
  }
  if (typeof raw.rateLimit === "number" && raw.rateLimit > 0) {
    patch.rateLimit = Math.floor(raw.rateLimit);
  }
  if (typeof raw.dailyQuota === "number" && raw.dailyQuota > 0) {
    patch.dailyQuota = Math.floor(raw.dailyQuota);
  }
  if (typeof raw.isActive === "boolean") {
    patch.isActive = raw.isActive;
  }

  return patch;
}

@Injectable()
export class AdminConsumersService {
  constructor(private readonly prisma: PrismaService) {}

  // Paginated list of all API consumers with their keys and usage counts.
  async listConsumers(query: Record<string, unknown>): Promise<PagedResult<ConsumerWithStats>> {
    const { page, pageSize } = parsePageParams(query);

    const [rows, total] = await Promise.all([
      this.prisma.apiConsumer.findMany({
        include: {
          user: { select: { id: true, name: true, email: true } },
          keys: { orderBy: { createdAt: "desc" } },
          _count: { select: { usageLog: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.apiConsumer.count(),
    ]);

    const data = rows.map((row) => ({
      ...row,
      kind: row.userId ? ("USER" as const) : ("EXTERNAL" as const),
    }));

    return { data, page, pageSize, total };
  }

  // Create a new API consumer.
  async createConsumer(body: unknown): Promise<ApiConsumer> {
    const params = parseConsumerBody(body);
    return this.prisma.apiConsumer.create({ data: params });
  }

  // Update an existing consumer's settings.
  async updateConsumer(consumerId: string, body: unknown): Promise<ApiConsumer | null> {
    const patch = parseUpdateConsumerBody(body);
    const existing = await this.prisma.apiConsumer.findUnique({ where: { id: consumerId } });
    if (!existing) return null;
    return this.prisma.apiConsumer.update({ where: { id: consumerId }, data: patch });
  }

  // Generate a new API key for a consumer. Returns the raw key ONCE —
  // it's never stored in plain text.
  async createApiKey(consumerId: string, label?: string): Promise<CreatedApiKey | null> {
    const consumer = await this.prisma.apiConsumer.findUnique({ where: { id: consumerId } });
    if (!consumer) return null;

    const { rawKey, keyHash } = generateApiKeyMaterial();

    const key = await this.prisma.apiKey.create({
      data: {
        consumerId,
        keyHash,
        label: label ?? null,
      },
    });

    return {
      id: key.id,
      label: key.label,
      rawKey,
      createdAt: key.createdAt,
    };
  }

  // Revoke an API key (soft-delete: mark as inactive).
  async revokeApiKey(consumerId: string, keyId: string): Promise<boolean> {
    const key = await this.prisma.apiKey.findFirst({
      where: { id: keyId, consumerId },
    });
    if (!key) return false;

    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });
    return true;
  }

  // Delete an API key outright — unlike revokeApiKey this removes the row
  // entirely rather than marking it inactive, for clearing out keys nobody
  // needs a record of any more (a revoked key's isActive:false stays
  // visible in the admin list until explicitly deleted like this).
  async deleteApiKey(consumerId: string, keyId: string): Promise<boolean> {
    const key = await this.prisma.apiKey.findFirst({
      where: { id: keyId, consumerId },
    });
    if (!key) return false;

    await this.prisma.apiKey.delete({ where: { id: keyId } });
    return true;
  }

  // Delete a consumer outright — unlike revokeApiKey this isn't a soft
  // delete: the consumer's own keys and usage log exist only to support
  // it (both `onDelete: Cascade` in the schema), so removing the consumer
  // removes them too. Matches AdminUsersService.deleteUser's hard delete,
  // not IngestionBatch's soft delete — a consumer has no downstream
  // provenance (like GameEvent rows) that needs to survive it.
  async deleteConsumer(consumerId: string): Promise<boolean> {
    const existing = await this.prisma.apiConsumer.findUnique({ where: { id: consumerId } });
    if (!existing) return false;

    await this.prisma.apiConsumer.delete({ where: { id: consumerId } });
    return true;
  }
}

export { parseConsumerBody, parseUpdateConsumerBody };
