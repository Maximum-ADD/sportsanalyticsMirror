import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ApiConsumer, ApiKey } from "@prisma/client";

// One consumer with aggregated usage stats — the admin list shows
// request counts alongside the consumer details so the admin can spot
// heavy users without a separate query.
export interface ConsumerWithStats extends ApiConsumer {
  keys: ApiKey[];
  _count: { usageLog: number };
}

// The raw key is only ever returned once — at creation time. The service
// stores a SHA-256 hash, and the client must save the raw key securely
// before the response is gone.
export interface CreatedApiKey {
  id: string;
  label: string | null;
  rawKey: string;
  createdAt: Date;
}

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

    const [data, total] = await Promise.all([
      this.prisma.apiConsumer.findMany({
        include: {
          keys: { orderBy: { createdAt: "desc" } },
          _count: { select: { usageLog: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.apiConsumer.count(),
    ]);

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

    // 32 random bytes, base64url-encoded — 43 characters, URL-safe, no
    // padding issues. Prefixed so a key is recognisable in logs.
    const rawKey = `nba_${randomBytes(32).toString("base64url")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

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
}

export { parseConsumerBody, parseUpdateConsumerBody };
