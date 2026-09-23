// How a prospect valuation is read: the labels, the money/slot formatting, the
// evidence-upload guards, and the local season-line derivation used for the
// live preview while somebody is still typing a game in.
//
// Named `prospectValue` rather than anything with "reliability" in it because
// lib/reliability.ts already exists and means something else entirely —
// PREDICTION reliability, i.e. how close a player's last N games landed to
// today's predicted points. The two concepts never meet, and sharing a
// vocabulary between them would be the worse kind of collision: one that
// type-checks.

import { NO_VALUE } from "@/lib/playerBio";
import type {
  CompetitionLevel,
  EvidenceStatus,
  ProspectGameInput,
  ProspectRankState,
  ProspectReliability,
  ProspectReliabilityTier,
  SeasonAverages,
} from "@/types/nba";

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

// Short forms for table cells and chips, where the full label would wrap.
export const COMPETITION_LEVEL_SHORT_LABELS: Record<CompetitionLevel, string> = {
  NCAA_D1: "D1",
  NCAA_D2: "D2",
  NCAA_D3: "D3",
  NAIA: "NAIA",
  JUCO: "JUCO",
  INTERNATIONAL_PRO: "Intl pro",
  SEMI_PRO: "Semi-pro",
  HIGH_SCHOOL: "HS",
  REC: "Rec",
};

export const COMPETITION_LEVELS_IN_ORDER: CompetitionLevel[] = [
  "NCAA_D1",
  "NCAA_D2",
  "NCAA_D3",
  "NAIA",
  "JUCO",
  "INTERNATIONAL_PRO",
  "SEMI_PRO",
  "HIGH_SCHOOL",
  "REC",
];

export const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, string> = {
  PENDING: "Awaiting review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

// The word is what carries the tier — the meter's colour only reinforces it,
// so the ladder still reads in greyscale and to a screen reader.
export const RELIABILITY_TIER_LABELS: Record<ProspectReliabilityTier, string> = {
  UNDOCUMENTED: "Undocumented",
  PARTIAL: "Partly verified",
  STRONG: "Well verified",
};

// ── Evidence upload guards ────────────────────────────────────────────────

// Mirrors the API's own limits, checked here so an obviously-invalid file is
// rejected before it reaches the network. Same arrangement — and the same
// caveat — as lib/avatar.ts: the API re-validates independently, so drift
// costs a late error message, not a security gap. PDFs are allowed here and
// not for avatars because a league's published stat sheet usually is one.
export const ALLOWED_EVIDENCE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
];
export const MAX_EVIDENCE_SIZE_MB = 10;

// ── Formatting ────────────────────────────────────────────────────────────

const MILLION = 1_000_000;
const THOUSAND = 1_000;

/**
 * A projected value as money, e.g. "$4.37M" or "$820K".
 *
 * @param valueUsd - whole dollars, or null when there is no figure at all.
 * @returns the formatted figure, or "—" for null.
 *
 * Null is the below-the-floor case and renders as NO_VALUE, never as "$0" —
 * a zero would be a claim that the model priced this player at nothing, which
 * is not what "we have not priced them yet" means.
 */
export function formatProjectedValue(valueUsd: number | null): string {
  if (valueUsd === null) return NO_VALUE;
  if (valueUsd >= MILLION) return `$${(valueUsd / MILLION).toFixed(2)}M`;
  if (valueUsd >= THOUSAND) return `$${Math.round(valueUsd / THOUSAND)}K`;
  return `$${valueUsd.toLocaleString("en-US")}`;
}

/**
 * The honest interval around a projection, e.g. "$3.1M – $5.9M".
 *
 * Returns "—" unless both ends are present: half an interval is not an
 * interval, and showing one bound alone would read as a point estimate.
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
 * A projected draft slot in words, e.g. "Slot 18", "2nd round", "Undrafted range".
 *
 * The slot — not the dollar figure — is what the model actually predicts, so
 * this is the primary object on the value card and the dollars are its
 * consequence.
 */
export function formatDraftSlot(slot: number | null): string {
  if (slot === null) return NO_VALUE;
  if (slot <= FIRST_ROUND_PICKS) return `Slot ${slot}`;
  if (slot <= DRAFT_PICKS) return "2nd round";
  return "Undrafted range";
}

/**
 * A leaderboard rank for the places that have room to explain themselves.
 *
 * Returns the word "Unranked" rather than nothing, because a silently absent
 * rank on a profile page reads as a bug while the word reads as a state. The
 * header badge is the deliberate exception — see ProRankBadge, which renders
 * nothing at all rather than putting a word in a 14px-tall bar.
 */
export function formatRank(rank: number | null): string {
  return rank === null ? "Unranked" : `#${rank}`;
}

/**
 * One sentence saying why a prospect has no rank, and what to do about it.
 *
 * Every branch names the actual cause. Collapsing these into one "not yet
 * ranked" would leave a qualified user staring at a dead chip with no idea
 * whether they are short of games or the system is broken.
 */
export function describeRankState(
  rankState: ProspectRankState,
  gamesLogged: number,
  minimumGamesRequired: number
): string | null {
  switch (rankState) {
    case "RANKED":
      return null;
    case "BELOW_GAMES_FLOOR": {
      const remaining = Math.max(0, minimumGamesRequired - gamesLogged);
      const games = remaining === 1 ? "game" : "games";
      return `${remaining} more ${games} needed — minimum ${minimumGamesRequired} to be valued and ranked.`;
    }
    case "AWAITING_VALUATION":
      return "Enough games logged — waiting on the next valuation run.";
    case "HIDDEN":
      return "This season is not shown on the public board.";
  }
}

/**
 * The reliability score as a figure, e.g. "38".
 *
 * Null means no games are on record at all. A score of 0 WITH games logged is
 * a real measurement — nothing has been documented yet — and renders as "0",
 * not as "—". Getting this backwards is the likeliest bug in the feature.
 */
export function formatReliabilityScore(score: number | null): string {
  return score === null ? NO_VALUE : `${score}`;
}

/** "4 of 14 games verified" — the fraction always stated in text. */
export function describeReliability(reliability: ProspectReliability): string {
  const { gamesVerified, gamesLogged, gamesDocumented } = reliability;
  if (gamesLogged === 0) return "No games logged yet.";
  const documentedNote =
    gamesDocumented > gamesVerified ? `, ${gamesDocumented} documented` : "";
  return `${gamesVerified} of ${gamesLogged} games verified${documentedNote}`;
}

// ── Local season-line derivation ──────────────────────────────────────────

// Mirrors apps/api/src/players/stats.service.ts's averageOf/percentageOf/round
// exactly, because the API's derivation is authoritative and this one only
// exists to keep the preview moving while a row is being typed. Any divergence
// would show the user one line and then save a different one.
//
// The rules that matter, all inherited rather than invented:
//   - percentages come from SEASON TOTALS, never by averaging per-game
//     percentages (a 1-for-1 night and a 5-for-20 night average to 52.5% but
//     are really 6-for-21);
//   - a percentage from zero attempts is 0, not null — SeasonAverages types
//     all three as a plain number and widening it would break every existing
//     consumer. The UI suppresses a meaningless 0% by checking attempts;
//   - assistToTurnoverRatio is null on zero turnovers, because the ratio is
//     undefined there rather than the worst possible;
//   - plusMinus, usage and both ratings are ALWAYS null: an amateur box score
//     does not carry them, and 0 would be a real measurement.

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function averageOf(values: number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentageOf(made: number, attempted: number): number {
  if (attempted === 0) return 0;
  return round((made / attempted) * 100);
}

function totalOf(games: ProspectGameInput[], select: (game: ProspectGameInput) => number): number {
  return games.reduce((sum, game) => sum + select(game), 0);
}

// Dean Oliver's coefficient, the same constant apps/predictor/four_factors.py
// and the API's own true-shooting derivation use.
const FREE_THROW_POSSESSION_WEIGHT = 0.44;
const POINTS_PER_SCORING_POSSESSION = 2;

/**
 * The season line implied by a set of logged games.
 *
 * FOR THE UNSAVED LOCAL PREVIEW ONLY. `ProspectProfile.seasonAverages` from
 * the API is authoritative everywhere a figure is published or ranked; this is
 * what keeps the derived line moving under someone's hands before they save.
 *
 * @param games - every game in the season, in any order.
 * @returns the same SeasonAverages shape the NBA endpoints return, so the
 *          existing stat tiles, radars and formatters accept it unchanged.
 */
export function deriveSeasonAverages(games: ProspectGameInput[]): SeasonAverages {
  const totalFieldGoalsMade = totalOf(games, (game) => game.fieldGoalsMade);
  const totalFieldGoalsAttempted = totalOf(games, (game) => game.fieldGoalsAttempted);
  const totalThreesMade = totalOf(games, (game) => game.threesMade);
  const totalThreesAttempted = totalOf(games, (game) => game.threesAttempted);
  const totalFreeThrowsMade = totalOf(games, (game) => game.freeThrowsMade);
  const totalFreeThrowsAttempted = totalOf(games, (game) => game.freeThrowsAttempted);
  const totalPoints = totalOf(games, (game) => game.points);
  const totalAssists = totalOf(games, (game) => game.assists);
  const totalTurnovers = totalOf(games, (game) => game.turnovers);

  const trueShootingAttempts =
    totalFieldGoalsAttempted + FREE_THROW_POSSESSION_WEIGHT * totalFreeThrowsAttempted;

  return {
    gamesPlayed: games.length,
    minutesPerGame: averageOf(games.map((game) => game.minutes)),
    pointsPerGame: averageOf(games.map((game) => game.points)),
    reboundsPerGame: averageOf(games.map((game) => game.rebounds)),
    assistsPerGame: averageOf(games.map((game) => game.assists)),
    stealsPerGame: averageOf(games.map((game) => game.steals)),
    blocksPerGame: averageOf(games.map((game) => game.blocks)),
    turnoversPerGame: averageOf(games.map((game) => game.turnovers)),
    fieldGoalsMadePerGame: averageOf(games.map((game) => game.fieldGoalsMade)),
    fieldGoalsAttemptedPerGame: averageOf(games.map((game) => game.fieldGoalsAttempted)),
    fieldGoalPercentage: percentageOf(totalFieldGoalsMade, totalFieldGoalsAttempted),
    threesMadePerGame: averageOf(games.map((game) => game.threesMade)),
    threesAttemptedPerGame: averageOf(games.map((game) => game.threesAttempted)),
    threePointPercentage: percentageOf(totalThreesMade, totalThreesAttempted),
    freeThrowsMadePerGame: averageOf(games.map((game) => game.freeThrowsMade)),
    freeThrowsAttemptedPerGame: averageOf(games.map((game) => game.freeThrowsAttempted)),
    freeThrowPercentage: percentageOf(totalFreeThrowsMade, totalFreeThrowsAttempted),

    trueShootingPercentage:
      trueShootingAttempts === 0
        ? 0
        : round((totalPoints / (POINTS_PER_SCORING_POSSESSION * trueShootingAttempts)) * 100),
    effectiveFieldGoalPercentage:
      totalFieldGoalsAttempted === 0
        ? 0
        : round(
            ((totalFieldGoalsMade + 0.5 * totalThreesMade) / totalFieldGoalsAttempted) * 100
          ),

    assistToTurnoverRatio:
      totalTurnovers === 0 ? null : roundToTwoDecimals(totalAssists / totalTurnovers),

    // An amateur box score carries none of these, and a zero would be a real
    // measurement (an even plus/minus, a 0% usage rate) rather than an absence.
    plusMinusPerGame: null,
    usagePercentage: null,
    offensiveRating: null,
    defensiveRating: null,
  };
}

/**
 * Whether a shooting percentage means anything for this line.
 *
 * percentageOf returns 0 from zero attempts because SeasonAverages types the
 * three shooting percentages as plain numbers. That 0 is type-legal and
 * meaningless, so every surface that prints one asks this first and renders
 * NO_VALUE instead — suppressing at the edge rather than widening the type and
 * breaking every existing consumer of SeasonAverages.
 */
export function hasAttempts(attemptsPerGame: number): boolean {
  return attemptsPerGame > 0;
}
