import type { ProspectReliabilityTier } from "./prospect-reliability.js";

// The pure arithmetic behind the Become Pro value board: who qualifies, how
// they are ordered, and what rank each one carries. Nothing here touches
// Nest, Prisma or HTTP, so the rules can be unit-tested from literals with no
// database and no app boot — the same shape as analytics/leaderboard-ranking.ts,
// which this deliberately mirrors.
//
// No figure is invented here. A prospect's value is whatever apps/valuation
// last computed for their season; this module only decides the order.

// How many logged games a season needs before it appears on the board.
//
// Without a floor, one enormous night sits above somebody who has logged
// thirty games of real production — the same "n too small" dishonesty the
// accuracy board's MINIMUM_CALLS_REQUIRED exists to prevent. Ten rather than
// that board's five because a season line is a stronger claim than a single
// game call, and because a shooting percentage over five games is mostly
// noise.
export const MINIMUM_GAMES_REQUIRED = 10;

export interface ProspectCandidate {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  competitionLevel: string;
  gamesLogged: number;
  pointsPerGame: number;
  projectedDraftSlot: number | null;
  // Null when the model has not valued this season yet. Such a candidate
  // never reaches the board — see qualifyProspects.
  projectedValueUsd: number | null;
  reliabilityTier: ProspectReliabilityTier;
  verifiedCoverage: number;
}

export interface ProspectRankedEntry extends Omit<ProspectCandidate, "projectedValueUsd"> {
  rank: number;
  // Non-null on a ranked row: a candidate without a valuation was dropped
  // before ranking, so every entry on the board carries a real figure.
  projectedValueUsd: number;
}

const FIRST_RANK = 1;

/**
 * Drops the seasons that cannot honestly be ranked.
 *
 * @param candidates - every public season, in any order.
 * @returns only those at or above MINIMUM_GAMES_REQUIRED that the model has
 *          actually valued.
 *
 * Two separate reasons to be absent, deliberately not collapsed: too few
 * games is the prospect's to fix, a missing valuation is the system's. The
 * API reports which one applies through rankState so the UI never shows a
 * dead "unranked" chip with no explanation.
 */
export function qualifyProspects(candidates: ProspectCandidate[]): ProspectCandidate[] {
  return candidates.filter(
    (candidate) => candidate.gamesLogged >= MINIMUM_GAMES_REQUIRED && candidate.projectedValueUsd !== null
  );
}

/**
 * Orders two qualifying seasons for the board.
 *
 * @returns negative when `a` outranks `b`.
 *
 * Value first. Then MORE GAMES WINS the tie, for the same reason the accuracy
 * board places the larger sample higher: the same projected value off thirty
 * games is a stronger claim than off ten. Then better-verified wins, so
 * documentation is worth something in a genuine tie. Username breaks what is
 * left purely so the order is deterministic — two prospects genuinely level
 * would otherwise come back in whatever order Postgres happened to produce,
 * making the board flicker between identical requests.
 */
function compareProspects(a: ProspectRankedEntry, b: ProspectRankedEntry): number {
  if (b.projectedValueUsd !== a.projectedValueUsd) return b.projectedValueUsd - a.projectedValueUsd;
  if (b.gamesLogged !== a.gamesLogged) return b.gamesLogged - a.gamesLogged;
  if (b.verifiedCoverage !== a.verifiedCoverage) return b.verifiedCoverage - a.verifiedCoverage;
  return a.username.localeCompare(b.username);
}

/**
 * Builds the ranked value board.
 *
 * @param candidates - every public season, in any order.
 * @returns the qualifying seasons, most valuable first, each carrying its
 *          rank. Ranking is DENSE on projected value: everyone level shares a
 *          rank and the next distinct value takes the next number, so three
 *          prospects tied at the top are all rank 1 and the fourth is rank 2,
 *          not rank 4.
 *
 * Ordering within a shared rank still follows compareProspects, so the rows
 * are stable even where the rank numbers repeat.
 */
export function rankProspects(candidates: ProspectCandidate[]): ProspectRankedEntry[] {
  const scored = qualifyProspects(candidates).map((candidate) => ({
    ...candidate,
    projectedValueUsd: candidate.projectedValueUsd as number,
    rank: FIRST_RANK,
  }));

  scored.sort(compareProspects);

  let currentRank = FIRST_RANK;
  return scored.map((entry, index) => {
    const previous = scored[index - 1];
    if (previous && previous.projectedValueUsd !== entry.projectedValueUsd) currentRank += 1;
    return { ...entry, rank: currentRank };
  });
}

/** Why one season carries no rank. */
export type ProspectRankState = "RANKED" | "BELOW_GAMES_FLOOR" | "AWAITING_VALUATION" | "HIDDEN";

/**
 * Names the reason a season is or is not on the board.
 *
 * Ordered most-specific-first: a private season is hidden whatever else is
 * true of it, and a season short of games is short of games whether or not
 * the model has run. Without this the UI can only say "not ranked", which
 * leaves somebody who has logged thirty games unable to tell a system fault
 * from their own shortfall.
 */
export function describeRankState(input: {
  isPublic: boolean;
  gamesLogged: number;
  hasValuation: boolean;
  rank: number | null;
}): ProspectRankState {
  if (!input.isPublic) return "HIDDEN";
  if (input.gamesLogged < MINIMUM_GAMES_REQUIRED) return "BELOW_GAMES_FLOOR";
  if (!input.hasValuation || input.rank === null) return "AWAITING_VALUATION";
  return "RANKED";
}
