import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiCookieAuth, ApiQuery, ApiResponse, ApiSecurity } from "@nestjs/swagger";
import { SeasonType } from "@prisma/client";
import { ErrorResponseDto } from "./error-response.dto.js";

// Security scheme names, registered on the document in main.ts.
export const API_KEY_SECURITY_NAME = "apiKey";
export const SESSION_COOKIE_SECURITY_NAME = "cookie";

/**
 * Documents a public read controller's access rule on every route in it:
 * an X-API-Key header or a signed-in session (two security entries, which
 * OpenAPI reads as either one), and the 401 and 429 errors ApiKeyGuard
 * returns. Apply it next to @UseGuards(OptionalSessionGuard, ApiKeyGuard).
 */
export function ApiKeyOrSessionAccess(): ClassDecorator {
  return applyDecorators(
    ApiSecurity(API_KEY_SECURITY_NAME),
    ApiCookieAuth(SESSION_COOKIE_SECURITY_NAME),
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      description: "No API key or session (API_KEY_REQUIRED), or the key is invalid or revoked (UNAUTHORIZED)",
      type: ErrorResponseDto,
    }),
    ApiResponse({
      status: HttpStatus.TOO_MANY_REQUESTS,
      description: "The key's per-minute rate limit (RATE_LIMIT_EXCEEDED) or daily quota (DAILY_QUOTA_EXCEEDED) is used up",
      type: ErrorResponseDto,
    }),
  );
}

/** Documents the page and pageSize query parameters every paginated list reads. */
export function ApiPageQuery(): MethodDecorator {
  return applyDecorators(
    ApiQuery({ name: "page", required: false, type: Number, description: "1-based page number (default 1)" }),
    ApiQuery({ name: "pageSize", required: false, type: Number, description: "Rows per page (default 25, max 100)" }),
  );
}

/**
 * Documents the seasonType query parameter. An unknown value is a 400 (see
 * parseSeasonType), so that response is documented with it.
 *
 * @param absentMeaning - what the endpoint does when the parameter is left
 *   out, e.g. "Defaults to REGULAR" or "Omit for every segment".
 */
export function ApiSeasonTypeQuery(absentMeaning: string): MethodDecorator {
  return applyDecorators(
    ApiQuery({
      name: "seasonType",
      required: false,
      enum: Object.values(SeasonType),
      description: `Season segment. ${absentMeaning}.`,
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid query parameter", type: ErrorResponseDto }),
  );
}

/** Documents a 404 with the standard error envelope. */
export function ApiNotFoundError(description: string): MethodDecorator {
  return ApiResponse({ status: HttpStatus.NOT_FOUND, description, type: ErrorResponseDto });
}
