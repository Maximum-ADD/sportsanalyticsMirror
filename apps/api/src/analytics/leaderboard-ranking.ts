// The pure arithmetic behind the accuracy leaderboard: who qualifies, how
// they are ordered, and what rank each one carries. Nothing here touches
// Nest, Prisma or HTTP — every function takes plain values and returns plain
// values, so the ranking rules can be unit-tested from literals with no
// database and no app boot.
//
// No basketball figure is invented here. A user's calls and correct calls are
// counts of their own GamePick rows; the model's are counts over games that
// already have both a final score and a GamePrediction.

// How many graded calls a USER needs before they appear on the board.
//
// Without a floor, one lucky call sits at 100% above somebody who has called
// forty games at 65% — which is the same "n too small" dishonesty the
// calibration table already refuses to print. The model is exempt: it has
// called every predicted game, so the floor can never exclude it, and a board
// with no benchmark on it is not a benchmark.
export const MINIMUM_CALLS_REQUIRED = 5;

// hitRate is a ratio in [0, 1] rounded to this many places. Without rounding,
// three correct from seven serialises as 0.42857142857142855 — float noise no
// caller wants and no display uses. Matches pick-grading.ts's rounding so the
// same person's figure cannot differ between the leaderboard and their own
// record.
const HIT_RATE_DECIMAL_PLACES = 4;
const DECIMAL_BASE = 10;

// The first rank on the board.
const FIRST_RANK = 1;

export type LeaderboardEntryKind = "user" | "model";

// One competitor before ranking: a name and their raw counts.
export interface LeaderboardCandidate {
  kind: LeaderboardEntryKind;
  name: string;
  calls: number;
  correct: number;
}

// One placed row on the board.
export interface LeaderboardEntry extends LeaderboardCandidate {
  rank: number;
  hitRate: number;
}

/**
 * Share of calls that were correct.
 *
 * @param correct - calls that picked the eventual winner.
 * @param calls - graded calls in total.
 * @returns the ratio in [0, 1] rounded to four places; 0 when there are no
 *          calls at all.
 *
 * Zero calls yields 0 rather than null here, unlike the accuracy ledger,
 * because a candidate with no calls never reaches the board: qualifyCandidates
 * has already dropped them, and the model always has calls whenever any game
 * has been predicted and played.
 */
export function calculateHitRate(correct: number, calls: number): number {
  if (calls === 0) return 0;
  const factor = DECIMAL_BASE ** HIT_RATE_DECIMAL_PLACES;
  return Math.round((correct / calls) * factor) / factor;
}

/**
 * Drops the users who have not called enough games to be judged.
 *
 * @param candidates - every user, plus the model.
 * @returns the model unconditionally, and only those users at or above
 *          MINIMUM_CALLS_REQUIRED.
 */
export function qualifyCandidates(candidates: LeaderboardCandidate[]): LeaderboardCandidate[] {
  return candidates.filter(
    (candidate) => candidate.kind === "model" || candidate.calls >= MINIMUM_CALLS_REQUIRED
  );
}

/**
 * Orders two candidates for the board.
 *
 * @returns negative when `a` outranks `b`.
 *
 * Accuracy first, then MORE CALLS WINS the tie — a 70% over forty games is a
 * stronger claim than a 70% over five, so the larger sample is placed higher
 * rather than lower. Name breaks the remaining ties purely so the order is
 * deterministic; two people genuinely level are otherwise returned in
 * whatever order Postgres happened to group them, which would make the board
 * flicker between identical requests.
 */
function compareCandidates(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.hitRate !== a.hitRate) return b.hitRate - a.hitRate;
  if (b.calls !== a.calls) return b.calls - a.calls;
  return a.name.localeCompare(b.name);
}

/**
 * Builds the ranked leaderboard.
 *
 * @param candidates - every user's counts plus the model's, in any order.
 * @returns the qualifying rows, best first, each carrying its hitRate and
 *          rank. Ranking is DENSE on hitRate: everyone level on accuracy
 *          shares a rank and the next distinct accuracy takes the next
 *          number, so three people tied at the top are all rank 1 and the
 *          fourth is rank 2 — not rank 4.
 *
 * Ordering within a shared rank still follows compareCandidates, so the rows
 * are stable even where the rank numbers repeat.
 */
export function rankLeaderboard(candidates: LeaderboardCandidate[]): LeaderboardEntry[] {
  const scored = qualifyCandidates(candidates).map((candidate) => ({
    ...candidate,
    hitRate: calculateHitRate(candidate.correct, candidate.calls),
    rank: FIRST_RANK,
  }));

  scored.sort(compareCandidates);

  let currentRank = FIRST_RANK;
  return scored.map((entry, index) => {
    const previous = scored[index - 1];
    if (previous && previous.hitRate !== entry.hitRate) currentRank += 1;
    return { ...entry, rank: currentRank };
  });
}
