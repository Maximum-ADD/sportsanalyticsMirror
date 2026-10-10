import { HttpStatus } from "@nestjs/common";
import { SeasonType } from "@prisma/client";
import { ApiException } from "./api-exception.js";

// Which season segment a request is asking about — the parameter that keeps
// regular-season and postseason figures from ever appearing in the same
// response. Validated against Prisma's generated SeasonType enum rather
// than a hand-maintained list here, so adding a segment to schema.prisma
// can never leave this file silently rejecting it.

// What a request means when it doesn't say. REGULAR keeps every caller that
// predates the postseason views (and the frontend's own default) on exactly
// the behaviour they had before the column existed.
export const DEFAULT_SEASON_TYPE: SeasonType = SeasonType.REGULAR;

const VALID_SEASON_TYPES: string[] = Object.values(SeasonType);

/**
 * Reads a `seasonType` query value.
 *
 * Returns undefined when the parameter is absent or empty — meaning "the
 * caller expressed no preference", which callers translate into either
 * DEFAULT_SEASON_TYPE or no filter at all depending on the endpoint.
 *
 * Throws a 400 on a value that isn't a SeasonType, rather than falling back
 * to the default. A typo like `?seasonType=playoffs` (lowercase) silently
 * returning regular-season numbers under a postseason heading is exactly
 * the cross-segment bleed this parameter exists to prevent, so it fails
 * loudly instead.
 */
export function parseSeasonType(rawSeasonType: unknown): SeasonType | undefined {
  if (rawSeasonType === undefined || rawSeasonType === "") return undefined;

  if (typeof rawSeasonType !== "string" || !VALID_SEASON_TYPES.includes(rawSeasonType)) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      "BAD_REQUEST",
      `seasonType must be one of ${VALID_SEASON_TYPES.join(", ")}`
    );
  }
  return rawSeasonType as SeasonType;
}
