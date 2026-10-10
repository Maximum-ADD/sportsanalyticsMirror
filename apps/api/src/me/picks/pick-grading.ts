import { PickOutcome } from "@prisma/client";

// The pure arithmetic behind "beat the model": who won a game, whether a call
// was right, and how a user's record compares with the model's over the same
// games. Nothing here touches Nest, Prisma's client or HTTP — every function
// takes plain values and returns plain values, so the maths can be unit
// tested without a database or an app boot.
//
// No basketball figure is invented here. A winner comes from Game.homeScore /
// Game.awayScore (the pipeline's own final score) and the model's call comes
// from GamePick's *AtPick snapshot of GamePrediction.homeWinProbability.

// A home win probability at or above this is the model calling the home team.
// Named because a bare 0.5 in an expression reads as an arbitrary threshold
// rather than "a coin flip".
const COIN_FLIP_PROBABILITY = 0.5;

// hitRate is a ratio in [0, 1] rounded to this many places. Without rounding,
// three wins from seven calls serialises as 0.42857142857142855 — noise from
// binary floating point that no caller wants and no display uses.
const HIT_RATE_DECIMAL_PLACES = 4;
const DECIMAL_BASE = 10;

// The final score of one game, as the pipeline stores it. Scores are nullable
// because Game rows exist before they are played.
export interface GameFinalScore {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
}

// One user call paired with its game's final score and the model snapshot
// taken when the call was made — everything needed to grade both sides.
export interface GradedPick {
  outcome: PickOutcome;
  modelHomeWinProbabilityAtPick: number;
  game: GameFinalScore;
}

// How the user and the model each fared on one and the same game.
export interface HeadToHeadOutcome {
  userOutcome: PickOutcome;
  modelOutcome: PickOutcome;
}

// The head-to-head summary returned by GET /v1/me/picks/record.
export interface PickRecord {
  wins: number;
  losses: number;
  total: number;
  hitRate: number;
  modelWins: number;
  modelLosses: number;
  modelHitRate: number;
}

/**
 * Works out which team actually won a game from its final score.
 *
 * @param finalScore - the game's two team ids and its stored final score.
 * @returns the winning team's id, or null when the game cannot be decided.
 *
 * Edge cases - returns null when either score is null (the game has not been
 * played, or the pipeline has not written its result yet) and when the two
 * scores are equal. A real NBA game cannot end level, so an equal score means
 * a partially ingested row rather than a draw; callers must treat null as
 * "not gradeable" rather than assuming a winner.
 */
export function determineWinningTeamId(finalScore: GameFinalScore): string | null {
  const { homeScore, awayScore } = finalScore;
  if (homeScore === null || awayScore === null || homeScore === awayScore) {
    return null;
  }
  return homeScore > awayScore ? finalScore.homeTeamId : finalScore.awayTeamId;
}

/**
 * Grades one call against the team that actually won.
 *
 * @param pickedTeamId - the team the caller took.
 * @param winningTeamId - the team that won, from determineWinningTeamId().
 * @returns CORRECT when they are the same team, MISSED otherwise.
 */
export function gradePickAgainstWinner(pickedTeamId: string, winningTeamId: string): PickOutcome {
  return pickedTeamId === winningTeamId ? PickOutcome.CORRECT : PickOutcome.MISSED;
}

/**
 * Turns a home win probability into the team the model was calling, so the
 * model can be graded on the same CORRECT/MISSED scale as the user.
 *
 * @param teams - the game's home and away team ids.
 * @param homeWinProbability - the model's probability that the home team wins, in [0, 1].
 * @returns the id of the team the model favoured.
 *
 * Edge case - exactly 0.5 is scored as a home call. The model is never truly
 * indifferent in the data (a tie would require both teams to carry identical
 * Elo ratings into the game), and inventing a third "no call" outcome would
 * make the model's record incomparable with the user's, which is the whole
 * point of the number.
 */
export function determineModelFavoriteTeamId(
  teams: { homeTeamId: string; awayTeamId: string },
  homeWinProbability: number
): string {
  return homeWinProbability >= COIN_FLIP_PROBABILITY ? teams.homeTeamId : teams.awayTeamId;
}

/**
 * Grades one stored call and the model's snapshot for the same game.
 *
 * @param pick - the stored outcome, the model snapshot, and the game's final score.
 * @returns both outcomes, or null when the game has no decided winner and
 *          neither side can fairly be scored on it.
 */
export function toHeadToHeadOutcome(pick: GradedPick): HeadToHeadOutcome | null {
  const winningTeamId = determineWinningTeamId(pick.game);
  if (winningTeamId === null) {
    return null;
  }
  const modelFavoriteTeamId = determineModelFavoriteTeamId(pick.game, pick.modelHomeWinProbabilityAtPick);
  return {
    userOutcome: pick.outcome,
    modelOutcome: gradePickAgainstWinner(modelFavoriteTeamId, winningTeamId),
  };
}

/**
 * Converts a win count into a hit rate.
 *
 * @param wins - calls graded CORRECT.
 * @param total - calls graded at all.
 * @returns wins / total in [0, 1], rounded to HIT_RATE_DECIMAL_PLACES.
 *
 * Edge case - returns 0 for zero calls rather than null or NaN. `total` is
 * always returned alongside it, so a caller can tell "nothing called yet"
 * from "called and never right" without every caller having to null-check.
 */
export function calculateHitRate(wins: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  const roundingFactor = DECIMAL_BASE ** HIT_RATE_DECIMAL_PLACES;
  return Math.round((wins / total) * roundingFactor) / roundingFactor;
}

// How many of a run of gradings came out right.
function countCorrect(outcomes: PickOutcome[]): number {
  return outcomes.filter((outcome) => outcome === PickOutcome.CORRECT).length;
}

/**
 * Totals a run of head-to-head gradings into the record envelope.
 *
 * @param outcomes - one entry per game both sides were graded on.
 * @returns wins/losses/total/hitRate for the user and the same three for the model.
 *
 * The model's figures are deliberately counted over exactly these entries and
 * no others. The model has an opinion on every predicted game in the
 * database, but scoring it over that whole population while the user is
 * scored over their handful of calls would compare two different sets of
 * games: a user who only calls lopsided matchups would look better or worse
 * than the model purely because of which games each side was measured on.
 * Restricting both to the same subset is the only comparison that answers
 * "did I beat the model on the games I actually called?".
 */
export function summarizePickRecord(outcomes: HeadToHeadOutcome[]): PickRecord {
  const total = outcomes.length;
  const wins = countCorrect(outcomes.map((outcome) => outcome.userOutcome));
  const modelWins = countCorrect(outcomes.map((outcome) => outcome.modelOutcome));
  return {
    wins,
    losses: total - wins,
    total,
    hitRate: calculateHitRate(wins, total),
    modelWins,
    modelLosses: total - modelWins,
    modelHitRate: calculateHitRate(modelWins, total),
  };
}

/**
 * Grades a user's stored calls and totals them in one step - the entry point
 * the record read service uses.
 *
 * @param picks - every GamePick belonging to one user, with its game's final score.
 * @returns the head-to-head record over the calls that could be graded.
 *
 * Edge case - calls on a game with no decided winner are dropped from both
 * sides rather than counted as losses, so `total` can be smaller than the
 * number of rows stored. Writes only ever accept a decided game, so this can
 * only happen if a final score is retracted upstream after the fact.
 */
export function summarizeHeadToHeadRecord(picks: GradedPick[]): PickRecord {
  const gradedOutcomes = picks
    .map(toHeadToHeadOutcome)
    .filter((outcome): outcome is HeadToHeadOutcome => outcome !== null);
  return summarizePickRecord(gradedOutcomes);
}
