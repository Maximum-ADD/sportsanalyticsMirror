import { NO_VALUE } from "@/lib/playerBio";

// Formatting for the figures that can legitimately be absent.
//
// Every one of these is null rather than zero when we have no basis to
// report it — a plus/minus of 0 is an even game, a usage rate of 0% is a
// player who never touched the ball, and an assist-to-turnover ratio of 0
// would mean the worst possible ratio rather than an undefined one. So
// "missing" has to render as "—" and never fall back to a numeric zero.

/** A percentage like usage or true shooting, or "—" when unavailable. */
export function formatPercentage(value: number | null): string {
  return value === null ? NO_VALUE : `${value}%`;
}

/** A plain figure like an offensive rating, or "—" when unavailable. */
export function formatNumber(value: number | null): string {
  return value === null ? NO_VALUE : `${value}`;
}

/**
 * Plus/minus, always carrying an explicit sign so a positive figure reads
 * as a positive one — "+3.2" rather than a bare "3.2" that could be
 * mistaken for a count. Zero is shown unsigned, since it's neither.
 */
export function formatPlusMinus(value: number | null): string {
  if (value === null) return NO_VALUE;
  if (value > 0) return `+${value}`;
  return `${value}`;
}

/**
 * Assist-to-turnover, at two decimal places to keep real differences
 * visible across its narrow range, or "—" when the player recorded no
 * turnovers and the ratio is undefined.
 */
export function formatRatio(value: number | null): string {
  return value === null ? NO_VALUE : value.toFixed(2);
}
