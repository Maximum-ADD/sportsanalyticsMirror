import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { ApiException } from "./api-exception.js";
import { ApiKeyLookupService } from "./api-key-lookup.service.js";
import { ApiUsageRecorder } from "./api-usage-recorder.service.js";
import { ConsumerRateLimiter } from "./consumer-rate-limiter.service.js";

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
//
// None of the three steps waits on the database for a key it has seen in
// the last minute: the lookup is cached, the limits are counted in memory
// and the usage row is batched (see each service). Every signed-out page
// view comes through here with the site proxy's key, so this sits in front
// of every public read, cached or not.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyLookup: ApiKeyLookupService,
    private readonly rateLimiter: ConsumerRateLimiter,
    private readonly usageRecorder: ApiUsageRecorder,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: { id: string };
      method: string;
      route?: { path?: string };
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

    const resolvedKey = await this.apiKeyLookup.findActiveKey(rawKey);
    if (!resolvedKey) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Invalid or inactive API key",
      );
    }

    const { consumer } = resolvedKey;
    const decision = await this.rateLimiter.admitRequest(consumer);
    if (decision === "RATE_LIMIT_EXCEEDED") {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        "RATE_LIMIT_EXCEEDED",
        `Rate limit of ${consumer.rateLimit} requests per minute exceeded`,
      );
    }
    if (decision === "DAILY_QUOTA_EXCEEDED") {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        "DAILY_QUOTA_EXCEEDED",
        `Daily quota of ${consumer.dailyQuota} requests exceeded`,
      );
    }

    // Stamp the request as API-key-authenticated for downstream use.
    (request as unknown as ApiKeyAuthenticatedRequest).apiConsumer = { ...consumer };

    this.usageRecorder.recordUsage({
      consumerId: consumer.id,
      keyId: resolvedKey.keyId,
      endpoint: `${request.method} ${request.route?.path ?? "unknown"}`,
    });

    return true;
  }
}
