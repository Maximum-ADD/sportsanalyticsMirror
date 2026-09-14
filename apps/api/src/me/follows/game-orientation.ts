import type { Team } from "@prisma/client";
import { toTeamSummary, type TeamSummary } from "./team-summary.js";

/**
 * Re-orients a stored game from the database's home/away frame into the
 * viewer's frame: "your team" and "the opponent", with the scores, the result
 * and the model's call all flipped to match. That reorientation is the whole
 * point of this endpoint - a raw slice of /v1/games would make the reader work
 * out for themselves whether their team was home, and whether a 0.62 home win
 * probability was a vote for them or against them.
 *
 * Everything here is pure: it takes rows the pipeline already produces (Game
 * with final scores, GamePrediction) and rearranges them. No new statistic is
 * invented, and nothing is estimated for a game that has not been played.
 */

// Above this the model called your team; below it, the opponent. Exactly at it
// the model called neither, and saying otherwise would read a preference into
// a coin flip.
const COIN_FLIP_PROBABILITY = 0.5;

// A win probability is stored as a float in [0, 1]; flipping it to the away
// team's perspective (1 - p) leaves binary-float dust behind - 1 - 0.58 is
// 0.42000000000000004 - so the flipped value is rounded back to the precision
// a probability is meaningfully reported at.
const PROBABILITY_DECIMAL_PLACES = 4;

// Predicted margins come out of the Four Factors model in points; negating one
// for the away perspective needs the same tidy-up.
const MARGIN_DECIMAL_PLACES = 2;

export type PredictedWinner = "YOUR_TEAM" | "OPPONENT";

/**
 * The GamePrediction fields this module reads, stated structurally so the
 * orientation logic and its unit spec need no Prisma client.
 */
export interface GamePredictionSnapshot {
  homeWinProbability: number;
  predictedMarginHome: number | null;
  marginMethod: string | null;
}

/**
 * A completed game plus its teams and (optional) prediction - structurally
 * what `prisma.game.findMany({ include: { homeTeam, awayTeam, prediction } })`
 * returns, without depending on that generated type.
 */
export interface GameForOrientation {
  id: string;
  nbaGameId: string;
  gameDate: Date;
  season: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number | null;
  awayScore: number | null;
  prediction: GamePredictionSnapshot | null;
}

/** The model's call for this game, stated from the viewer's side of it. */
export interface OrientedModelCall {
  // Null only when the stored probability is exactly 0.5 - the model split the
  // game evenly and did not pick anyone.
  predictedWinner: PredictedWinner | null;
  yourTeamWinProbability: number;
  // Positive means the model expected your team to win by this many points.
  // Null when the Four Factors margin could not be computed for this game
  // (neither team had enough completed games yet) - see GamePrediction's own
  // comments. It is left null rather than substituted with a guess.
  predictedMarginInPoints: number | null;
  marginMethod: string | null;
  // Whether the call matched the final score. Null when the model picked
  // nobody, which cannot be scored either way.
  wasCorrect: boolean | null;
}

/** One row of the "your teams" results feed. */
export interface OrientedGameResult {
  gameId: string;
  nbaGameId: string;
  gameDate: Date;
  season: string;
  yourTeam: TeamSummary;
  opponent: TeamSummary;
  yourScore: number;
  opponentScore: number;
  won: boolean;
  playedAtHome: boolean;
  // Null when predict_games.py never wrote a prediction for this game.
  modelCall: OrientedModelCall | null;
}

function roundToDecimalPlaces(value: number, decimalPlaces: number): number {
  const scalingFactor = 10 ** decimalPlaces;
  return Math.round(value * scalingFactor) / scalingFactor;
}

/**
 * Picks which of a game's two teams the feed should be written from.
 *
 * @param followedTeamIds - the ids of the teams this user follows.
 * @param primaryTeamId - the user's one primary team, or null if they have
 *                        none. It breaks the tie when the user follows both
 *                        sides of the same game.
 * @param game - the game being oriented.
 * @returns the team id to orient to, or null when the user follows neither
 *          side (a game that should not have been fetched at all).
 * @remarks A user who follows both teams sees the game once, not twice: their
 *          primary team wins the tie, and failing that the home team does, so
 *          the choice is deterministic rather than dependent on row order.
 */
export function chooseOrientationTeamId(
  followedTeamIds: ReadonlySet<string>,
  primaryTeamId: string | null,
  game: Pick<GameForOrientation, "homeTeamId" | "awayTeamId">
): string | null {
  const followsHomeTeam = followedTeamIds.has(game.homeTeamId);
  const followsAwayTeam = followedTeamIds.has(game.awayTeamId);

  if (followsHomeTeam && followsAwayTeam) {
    return primaryTeamId === game.awayTeamId ? game.awayTeamId : game.homeTeamId;
  }
  if (followsHomeTeam) return game.homeTeamId;
  if (followsAwayTeam) return game.awayTeamId;
  return null;
}

function choosePredictedWinner(yourTeamWinProbability: number): PredictedWinner | null {
  if (yourTeamWinProbability === COIN_FLIP_PROBABILITY) return null;
  return yourTeamWinProbability > COIN_FLIP_PROBABILITY ? "YOUR_TEAM" : "OPPONENT";
}

function orientPredictedMargin(predictedMarginHome: number | null, yourTeamIsHome: boolean): number | null {
  if (predictedMarginHome === null) return null;
  const marginFromYourSide = yourTeamIsHome ? predictedMarginHome : -predictedMarginHome;
  return roundToDecimalPlaces(marginFromYourSide, MARGIN_DECIMAL_PLACES);
}

function scoreModelCall(predictedWinner: PredictedWinner | null, yourTeamWon: boolean): boolean | null {
  if (predictedWinner === null) return null;
  return (predictedWinner === "YOUR_TEAM") === yourTeamWon;
}

/**
 * Flips a stored, home-framed prediction onto the viewer's side of the game.
 *
 * @param prediction - the GamePrediction fields, or null if none was written.
 * @param yourTeamIsHome - whether the viewer's team was the home team.
 * @param yourTeamWon - the actual result, used to score the call.
 * @returns the oriented call, or null when there is no prediction to orient.
 */
export function orientModelCall(
  prediction: GamePredictionSnapshot | null,
  yourTeamIsHome: boolean,
  yourTeamWon: boolean
): OrientedModelCall | null {
  if (!prediction) return null;

  const yourTeamWinProbability = roundToDecimalPlaces(
    yourTeamIsHome ? prediction.homeWinProbability : 1 - prediction.homeWinProbability,
    PROBABILITY_DECIMAL_PLACES
  );
  const predictedWinner = choosePredictedWinner(yourTeamWinProbability);

  return {
    predictedWinner,
    yourTeamWinProbability,
    predictedMarginInPoints: orientPredictedMargin(prediction.predictedMarginHome, yourTeamIsHome),
    marginMethod: prediction.marginMethod,
    wasCorrect: scoreModelCall(predictedWinner, yourTeamWon),
  };
}

/**
 * Rewrites one game from the viewer's team's point of view.
 *
 * @param game - the game with both teams and its prediction included.
 * @param yourTeamId - the followed team to orient to; must be one of the two
 *                     teams in the game.
 * @returns the oriented result, or null when the game cannot honestly be
 *          reported: it has no final score yet (either score null - a
 *          scheduled or in-progress game), or the given team did not play in
 *          it. Callers drop the nulls rather than showing a half-filled row.
 */
export function orientGameToTeam(game: GameForOrientation, yourTeamId: string): OrientedGameResult | null {
  const yourTeamIsHome = game.homeTeamId === yourTeamId;
  const yourTeamIsAway = game.awayTeamId === yourTeamId;
  if (!yourTeamIsHome && !yourTeamIsAway) return null;
  if (game.homeScore === null || game.awayScore === null) return null;
  // A draw has no winner to orient the row around. Reporting it with
  // `won: yourScore > opponentScore` would call it a LOSS — and a loss for
  // both sides, since each follower sees it from their own team's side — and
  // would then grade the model's call against that invented result. Dropped
  // for the same reason an undecided game is.
  if (game.homeScore === game.awayScore) return null;

  const yourScore = yourTeamIsHome ? game.homeScore : game.awayScore;
  const opponentScore = yourTeamIsHome ? game.awayScore : game.homeScore;
  const won = yourScore > opponentScore;

  return {
    gameId: game.id,
    nbaGameId: game.nbaGameId,
    gameDate: game.gameDate,
    season: game.season,
    yourTeam: toTeamSummary(yourTeamIsHome ? game.homeTeam : game.awayTeam),
    opponent: toTeamSummary(yourTeamIsHome ? game.awayTeam : game.homeTeam),
    yourScore,
    opponentScore,
    won,
    playedAtHome: yourTeamIsHome,
    modelCall: orientModelCall(game.prediction, yourTeamIsHome, won),
  };
}
