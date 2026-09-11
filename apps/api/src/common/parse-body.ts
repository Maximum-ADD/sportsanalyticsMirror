import { HttpStatus } from "@nestjs/common";
import type { ZodError, ZodType } from "zod";
import { ApiException } from "./api-exception.js";

// Request-payload validation, in the same hand-rolled style as
// parsePageParams: plain exported functions a controller calls explicitly,
// rather than class-validator DTOs behind a global ValidationPipe. The
// reason is the error envelope — every failure in this API is
// { error: { code, message } } via ApiException, and a ValidationPipe throws
// Nest's own BadRequestException shape, which AllExceptionsFilter can only
// flatten into a generic HTTP_ERROR. Validating here keeps the 400 body
// identical to every other error this API returns.
//
// Usage:
//   const createPickSchema = z.object({ gameId: z.uuid(), pickedTeamId: z.uuid() });
//   const payload = parseBody(createPickSchema, body);   // typed, or throws 400

// How many separate problems a single 400 message reports. All of them would
// make an unbounded, unreadable string for a large payload; one alone hides
// that a caller got three fields wrong.
const MAX_REPORTED_ISSUES = 3;

// Renders one Zod issue as "field.path: message", or just the message when
// the issue is about the payload as a whole (e.g. it wasn't an object).
function describeIssue(issue: ZodError["issues"][number]): string {
  const fieldPath = issue.path.join(".");
  return fieldPath ? `${fieldPath}: ${issue.message}` : issue.message;
}

// Builds the human-readable half of the 400 body, e.g.
// "Invalid request body: name: Too small: expected string to have >=1 characters".
function describeValidationFailure(subjectName: string, error: ZodError): string {
  const describedIssues = error.issues.slice(0, MAX_REPORTED_ISSUES).map(describeIssue);
  return `Invalid ${subjectName}: ${describedIssues.join("; ")}`;
}

// Runs one schema over one value, returning the parsed (and Zod-coerced,
// defaulted, stripped) result or throwing the API's standard 400.
function validateAgainstSchema<T>(schema: ZodType<T>, value: unknown, subjectName: string): T {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  throw new ApiException(
    HttpStatus.BAD_REQUEST,
    "BAD_REQUEST",
    describeValidationFailure(subjectName, result.error)
  );
}

/**
 * Validates a request body against a Zod schema.
 *
 * @param schema - the shape the body must match; its output type is what the caller gets back.
 * @param body - the raw `@Body()` value. Express's json parser gives `{}` for an absent body and
 *               can give any JSON type (array, string, null) for a present one, so the schema —
 *               not this function — decides what is acceptable.
 * @returns the parsed value, typed as the schema's output.
 * @throws ApiException 400 BAD_REQUEST listing up to three failing fields.
 */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  return validateAgainstSchema(schema, body, "request body");
}

/**
 * Validates query-string parameters against a Zod schema. Complements
 * parsePageParams(), which owns ?page/?pageSize alone — use this for a route's
 * own filters. Note every value arrives as a string, so schemas here generally
 * need z.coerce.* rather than z.number()/z.boolean().
 *
 * @param schema - the shape the query must match.
 * @param query - the raw `@Query()` object.
 * @returns the parsed value, typed as the schema's output.
 * @throws ApiException 400 BAD_REQUEST listing up to three failing parameters.
 */
export function parseQueryParams<T>(schema: ZodType<T>, query: Record<string, unknown>): T {
  return validateAgainstSchema(schema, query, "query parameters");
}
