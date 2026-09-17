import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { ApiException } from "./api-exception.js";
import { PrismaService } from "../prisma/prisma.service.js";

// The request shape after a successful API key check — downstream guards
// and controllers can read the consumer identity without a second lookup.
export interface ApiKeyAuthenticatedRequest {
  apiConsumer: {
    id: string;
    name: string;
    rateLimit: number;
    dailyQuota: number;
  };
}

// Authenticates a request by its X-API-Key header, checks rate limits
// and daily quotas, and logs the request for usage tracking. Applied
// at the class level on the public read controllers (players, games,
// teams, analytics, datasets), behind OptionalSessionGuard: a request
// with a valid session passes as the signed-in user, a valid key passes
// with the consumer identity stamped for downstream use, and anything
// else — no session, no key — is rejected with 401.
//
// Deliberately NOT applied to session-gated controllers (/v1/me/**,
// /v1/admin/**, optimizer, custom-statistics): the guard never sets
// request.user, so those routes stay session-only regardless — an API
// key alone can never reach anything restricted.
//
// The guard never rejects a request that already has a session user
// (set by OptionalSessionGuard or SessionAuthGuard), so a dual-auth
// endpoint lets either mechanism succeed.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: { id: string };
    }>();

    // If SessionAuthGuard already authenticated the request, skip the
    // API key check — the endpoint accepts either mechanism.
    if (request.user) return true;

    const rawKey = request.headers["x-api-key"];
    if (typeof rawKey !== "string" || rawKey.trim().length === 0) {
      // No API key and no session (OptionalSessionGuard already had the
      // chance to attach one): these endpoints still require one or the
      // other, so anonymous callers are turned away here.
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "API_KEY_REQUIRED",
        "An API key or a signed-in session is required",
      );
    }

    // Hash the raw key and look up the matching row.
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { consumer: true },
    });

    if (!apiKey || !apiKey.isActive || !apiKey.consumer.isActive) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Invalid or inactive API key",
      );
    }

    const consumer = apiKey.consumer;

    // Rate limit: count requests in the last 60 seconds.
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    const recentCount = await this.prisma.apiUsageLog.count({
      where: {
        consumerId: consumer.id,
        calledAt: { gte: oneMinuteAgo },
      },
    });

    if (recentCount >= consumer.rateLimit) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        "RATE_LIMIT_EXCEEDED",
        `Rate limit of ${consumer.rateLimit} requests per minute exceeded`,
      );
    }

    // Daily quota: count requests today.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const dailyCount = await this.prisma.apiUsageLog.count({
      where: {
        consumerId: consumer.id,
        calledAt: { gte: startOfDay },
      },
    });

    if (dailyCount >= consumer.dailyQuota) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        "DAILY_QUOTA_EXCEEDED",
        `Daily quota of ${consumer.dailyQuota} requests exceeded`,
      );
    }

    // Stamp the request as API-key-authenticated for downstream use.
    (request as unknown as ApiKeyAuthenticatedRequest).apiConsumer = {
      id: consumer.id,
      name: consumer.name,
      rateLimit: consumer.rateLimit,
      dailyQuota: consumer.dailyQuota,
    };

    // Update the key's last-used timestamp and log the usage.
    // Fire-and-forget: don't block the response on the write.
    const endpoint = `${context.switchToHttp().getRequest().method} ${context.switchToHttp().getRequest().route?.path ?? "unknown"}`;

    this.prisma.$transaction([
      this.prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      }),
      this.prisma.apiUsageLog.create({
        data: {
          consumerId: consumer.id,
          endpoint,
          statusCode: 200,
        },
      }),
    ]).catch(() => {/* usage logging must never break a request */});

    return true;
  }
}
