// How a Become Pro valuation is read: the competition-level labels, the
// money and draft-slot formatting, and the sentence explaining why a season
// has no value yet.
//
// Named `prospectValue` rather than anything with "reliability" in it because
// lib/reliability.ts already exists and means something else entirely —
// PREDICTION reliability for NBA players.
//
// There is no local season-line derivation here on purpose: the API derives
// the line from the logged games (with the same code it uses for NBA players)
// and re-values the season on every write, so the page simply refetches. A
// second derivation in the browser could only ever disagree with the real one.

import { NO_VALUE } from "@/lib/playerBio";
import type { CompetitionLevel, ValuationState } from "@/types/nba";

// ── Labels ────────────────────────────────────────────────────────────────

// Every CompetitionLevel needs an entry here; the spec asserts exhaustiveness
// so adding a level to the union without a label fails the suite rather than
// rendering a raw enum slug to a user.
export const COMPETITION_LEVEL_LABELS: Record<CompetitionLevel, string> = {
  NCAA_D1: "NCAA Division I",
  NCAA_D2: "NCAA Division II",
  NCAA_D3: "NCAA Division III",
  NAIA: "NAIA",
  JUCO: "Junior college",
  INTERNATIONAL_PRO: "International pro",
  SEMI_PRO: "Semi-pro",
  HIGH_SCHOOL: "High school",
  REC: "Recreational",
};

// Ordered from the strongest competition to the weakest, which is the order
// somebody scanning the picker expects.
export const COMPETITION_LEVELS_IN_ORDER: CompetitionLevel[] = [
  "NCAA_D1",
  "INTERNATIONAL_PRO",
  "NCAA_D2",
  "NAIA",
  "JUCO",
  "NCAA_D3",
  "SEMI_PRO",
  "HIGH_SCHOOL",
  "REC",
];

// The same five positions the players list filters by (PlayersFilterBar), so
// a user describes themselves in the vocabulary the rest of the app uses.
export const PROSPECT_POSITIONS = ["G", "F", "C", "G-F", "F-C"] as const;

// ── League years ──────────────────────────────────────────────────────────

// The NBA season turns over in the northern summer: from July a new league
// year is the current one. Amateur seasons broadly follow the same calendar,
// and matching the NBA's labels is what lets a season sit beside an NBA one.
const SEASON_ROLLOVER_MONTH = 6; // July, zero-based

/**
 * Recent league years, newest first, in the "2025-26" form Game.season uses.
 *
 * Offered as a list rather than a free-text box: the API only accepts that
 * exact shape, and a picker cannot produce "2025/26" or "25-26".
 *
 * @param today - "now", injected so the list is testable without the clock.
 */
export function recentLeagueYears(today: Date, count = 8): string[] {
  const startYear = today.getMonth() >= SEASON_ROLLOVER_MONTH ? today.getFullYear() : today.getFullYear() - 1;
  return Array.from({ length: count }, (_, offset) => {
    const year = startYear - offset;
    return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
  });
}

// ── Formatting ────────────────────────────────────────────────────────────

const MILLION = 1_000_000;
const THOUSAND = 1_000;

/**
 * A projected value as money, e.g. "$4.37M" or "$820K".
 *
 * Null renders as NO_VALUE, never as "$0" — a zero would claim the model
 * priced this player at nothing, which is not what "not valued yet" means.
 */
export function formatProjectedValue(valueUsd: number | null): string {
  if (valueUsd === null) return NO_VALUE;
  if (valueUsd >= MILLION) return `$${(valueUsd / MILLION).toFixed(2)}M`;
  if (valueUsd >= THOUSAND) return `$${Math.round(valueUsd / THOUSAND)}K`;
  return `$${valueUsd.toLocaleString("en-US")}`;
}

/**
 * The honest interval around a projection, e.g. "$3.10M – $5.90M".
 *
 * Returns "—" unless both ends are present: half an interval is not an
 * interval, and one bound alone would read as a point estimate.
 */
export function formatValueRange(lowUsd: number | null, highUsd: number | null): string {
  if (lowUsd === null || highUsd === null) return NO_VALUE;
  return `${formatProjectedValue(lowUsd)} – ${formatProjectedValue(highUsd)}`;
}

// The first round is 30 picks; the draft runs to 60. Past that a prospect is
// priced against the undrafted end of the scale rather than a pick number.
const FIRST_ROUND_PICKS = 30;
const DRAFT_PICKS = 60;

/**
 * A projected draft slot in words, e.g. "Pick 18", "2nd round", "Undrafted range".
 *
 * The slot — not the dollar figure — is what the model actually predicts, so
 * this is the primary object on the value card and the dollars are its
 * consequence.
 */
export function formatDraftSlot(slot: number | null): string {
  if (slot === null) return NO_VALUE;
  if (slot <= FIRST_ROUND_PICKS) return `Pick ${slot}`;
  if (slot <= DRAFT_PICKS) return "2nd round";
  return "Undrafted range";
}

/**
 * One sentence saying why a season has no value yet, and what to do about it.
 *
 * The two reasons are deliberately kept apart: somebody who has logged thirty
 * games must be able to tell "the model is not ready" from "I have not logged
 * enough", or a system gap reads as their own shortfall.
 *
 * @returns null when the season is valued — there is nothing to explain.
 */
export function describeValuationState(
  state: ValuationState | null,
  gamesLogged: number,
  minimumGamesRequired: number
): string | null {
  switch (state) {
    case "VALUED":
      return null;
    case "AWAITING_MODEL":
      return "You have logged enough games. The valuation model has not been trained yet, so there is no figure to show.";
    case "BELOW_GAMES_FLOOR":
    case null: {
      const remaining = Math.max(0, minimumGamesRequired - gamesLogged);
      const games = remaining === 1 ? "game" : "games";
      return `${remaining} more ${games} needed — a season is valued once it has ${minimumGamesRequired}.`;
    }
  }
}

/**
 * Whether a shooting percentage means anything for this line.
 *
 * The API returns 0 for a percentage with no attempts behind it, because
 * SeasonAverages types the three shooting percentages as plain numbers. That
 * 0 is type-legal and meaningless, so every surface that prints one asks this
 * first and renders NO_VALUE instead — suppressing at the edge rather than
 * widening a type every NBA page depends on.
 */
export function hasAttempts(attemptsPerGame: number): boolean {
  return attemptsPerGame > 0;
}
