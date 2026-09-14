import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { allowedOrigins } from "./allowed-origins.js";
import { ApiException } from "./api-exception.js";

// CSRF defence for state-changing requests.
//
// In production BetterAuth's session cookies are SameSite=None (see
// auth.config.ts for why the cross-site deployment forces that), which means
// the browser attaches them to requests any site can initiate. SessionAuthGuard
// only asks "is this a valid session?" — it cannot tell a request made by our
// own web app from one made by a page on evil.example that borrowed the user's
// cookie. While the API was read-only that was harmless; the moment a write
// route exists it is a real hole, so this guard closes it before the first one
// ships.
//
// The check is the standard one: a state-changing request must declare an
// Origin this API already trusts (the same allowedOrigins list CORS and
// BetterAuth use). CORS alone is not enough — the browser enforces CORS on the
// *response*, so a cross-site POST still reaches the handler and still commits
// its write before the caller is denied the reply.

// Requests that cannot change state, so cannot be the target of a CSRF write.
// GET/HEAD are safe by HTTP's own definition; OPTIONS is the CORS preflight,
// which must be allowed through for the real request to ever be sent.
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

@Injectable()
export class OriginCheckGuard implements CanActivate {
  /**
   * @param context - the incoming request context.
   * @returns true when the request may proceed.
   * @throws ApiException 403 FORBIDDEN when a state-changing request carries an untrusted Origin.
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (SAFE_METHODS.includes(request.method)) {
      return true;
    }
    return allowStateChangingOrigin(request.headers.origin);
  }
}

/**
 * Decides whether a state-changing request's Origin header is acceptable.
 *
 * @param requestOrigin - the Origin header, or undefined when the client sent none.
 * @returns true when the request may proceed.
 * @throws ApiException 403 FORBIDDEN for an Origin outside allowedOrigins.
 *
 * Edge case — a missing Origin is allowed, matching the CORS middleware in
 * main.ts, which already treats "no Origin" as a non-browser caller (curl,
 * server-to-server, health checks). Every current browser sends Origin on
 * fetch, XHR and cross-site form posts, so this is not a way back in for the
 * attack above; it only avoids breaking clients that were never the threat.
 */
function allowStateChangingOrigin(requestOrigin: string | undefined): boolean {
  if (!requestOrigin || allowedOrigins.includes(requestOrigin)) {
    return true;
  }
  throw new ApiException(
    HttpStatus.FORBIDDEN,
    "FORBIDDEN",
    `Origin ${requestOrigin} is not allowed to make state-changing requests`
  );
}
