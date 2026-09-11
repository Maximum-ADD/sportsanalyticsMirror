import { Injectable } from "@nestjs/common";
import type { EvaluatedGame } from "./evaluated-game.js";

// The model's pick is whichever side it makes the favourite. At exactly 0.5
// it is a coin flip; ">=" breaks the tie toward the home team so that every
// game has exactly one pick and no game is silently dropped.
const FAVOURITE_PROBABILITY_THRESHOLD = 0.5;

// Calibration bands, as lower edges of the FAVOURITE's probability. Because
// the favourite's probability is max(p, 1 - p), it always lies in [0.5, 1],
// so these five bands cover every game with none left over.
const CALIBRATION_BAND_LOWER_EDGES = [0.5, 0.6, 0.7, 0.8, 0.9];
const CALIBRATION_BAND_WIDTH = 0.1;
const PROBABILITY_UPPER_BOUND = 1;

// Band labels are quoted in percent ("50-60"), so edges are scaled up for
// display only. The arithmetic itself stays in probability space.
const PERCENTAGE_SCALE = 100;

// Binary outcomes, as the Brier score scores them: the home team either won
// (1) or did not (0).
const HOME_WIN_OUTCOME = 1;
const HOME_LOSS_OUTCOME = 0;

// Rates and scores are rounded before they leave the service so that
// repeated floating-point addition doesn't surface as 0.6799999999999999 in
// the JSON response. Four places is finer than anything the UI shows.
const REPORTED_DECIMAL_PLACES = 4;

// Band edges are literals like 0.6 that cannot be represented exactly in
// binary floating point, so a probability of exactly 0.6 can compare as
// fractionally below the 0.6 edge. This tolerance keeps such a value in the
// band a human would put it in (60-70, not 50-60).
const BAND_EDGE_TOLERANCE = 1e-9;

// One probability band and how the model actually did inside it. A
// well-calibrated model has actualWinRate close to meanPredicted in every
// band: when it says 70%, the favourite should win about 70% of the time.
export interface CalibrationBand {
  // Percent range of the favourite's probability, e.g. "70-80".
  band: string;

  // Mean favourite probability of the games that landed here, or null when
  // no game did — null rather than 0 because "no games" is not "0%".
  meanPredicted: number | null;

  // Share of those games the favourite actually won, or null when the band
  // is empty.
  actualWinRate: number | null;

  gamesInBand: number;
}

// The ledger the /v1/analytics/model-accuracy route returns.
//
// accuracy, brierScore and homeBaselineAccuracy are null — never 0 — when no
// game is evaluable, because with nothing to score the honest answer is "we
// don't know", and a 0 there would read as "the model got everything wrong".
export interface ModelAccuracyReport {
  // Share of evaluated games the model's favourite actually won, in [0, 1].
  accuracy: number | null;

  // Mean squared error of homeWinProbability against the actual home result
  // (1 or 0). Lower is better; 0.25 is what always guessing 50% scores.
  brierScore: number | null;

  // What "always pick the home team" would have scored on exactly the same
  // games. Without it the accuracy figure means nothing — home teams win
  // most NBA games, so a model has to beat this to be worth anything.
  homeBaselineAccuracy: number | null;

  // How many games had both a final score and a prediction.
  gamesEvaluated: number;

  // Of those, how many predictions were genuinely written BEFORE tip-off.
  // Reported separately and honestly: a prediction row written after the
  // final whistle proves nothing, and this count is how a reader tells the
  // difference. It is legitimately 0 — and is expected to be, today —
  // because predict_games.py sets "createdAt" = now() on every upsert and
  // the ingestion only stores games that have already been played, so a
  // re-run turns a genuine forecast back into a backfill. Treat it as a
  // conservative lower bound on real forward predictions, not as a defect.
  forwardPredictionCount: number;

  // Always all five bands, in ascending order, even when empty.
  calibration: CalibrationBand[];
}

// Rounds a rate or score to the precision the API reports, trimming
// floating-point noise from the accumulated sums.
function roundToReportedPrecision(value: number): number {
  const decimalScale = 10 ** REPORTED_DECIMAL_PLACES;
  return Math.round(value * decimalScale) / decimalScale;
}

// True when the game has a winner. NBA games cannot end level (overtime is
// played until one side leads), so this only ever excludes a malformed row —
// but scoring a level game as an away win would quietly bias every figure.
function isDecidedGame(game: EvaluatedGame): boolean {
  return game.homeScore !== game.awayScore;
}

// True when the home team won on the final score.
function didHomeTeamWin(game: EvaluatedGame): boolean {
  return game.homeScore > game.awayScore;
}

// True when the model made the HOME team the favourite.
function didModelPickHomeTeam(game: EvaluatedGame): boolean {
  return game.homeWinProbability >= FAVOURITE_PROBABILITY_THRESHOLD;
}

// True when the model's favourite won. Picking the home team and the home
// team winning, or picking the away team and the home team losing, are both
// correct calls — hence the equality rather than a pair of branches.
function didModelCallGameCorrectly(game: EvaluatedGame): boolean {
  return didModelPickHomeTeam(game) === didHomeTeamWin(game);
}

// The model's raw record: games it was scored on, and how many it called
// right.
export interface ModelRecord {
  calls: number;
  correct: number;
}

/**
 * Counts the model's decided calls and its correct ones.
 *
 * @param evaluatedGames - games with both a final score and a prediction.
 * @returns the counts, over decided games only (a drawn game has no winner to
 *          be right or wrong about).
 *
 * Exported so the leaderboard's model row and this ledger's accuracy figure
 * come from ONE code path. They are the same claim about the same model, and
 * two endpoints quietly disagreeing about it — because one filtered draws and
 * the other did not, say — is exactly the kind of contradiction nobody spots
 * until a marker does.
 */
export function summarizeModelRecord(evaluatedGames: EvaluatedGame[]): ModelRecord {
  const decidedGames = evaluatedGames.filter(isDecidedGame);
  return {
    calls: decidedGames.length,
    correct: decidedGames.filter(didModelCallGameCorrectly).length,
  };
}

// Squared error of one prediction against the actual home result — the
// per-game term of the Brier score. A 0.8 that comes in is (0.8 - 1)^2 =
// 0.04; the same 0.8 that misses is (0.8 - 0)^2 = 0.64.
function calculateSquaredError(game: EvaluatedGame): number {
  const actualHomeOutcome = didHomeTeamWin(game) ? HOME_WIN_OUTCOME : HOME_LOSS_OUTCOME;
  const errorMargin = game.homeWinProbability - actualHomeOutcome;
  return errorMargin * errorMargin;
}

// The probability the model gave to whichever side it favoured, always in
// [0.5, 1]. Bucketing on this rather than on homeWinProbability is what lets
// a confident away pick (p = 0.15) sit in the same 80-90 band as an equally
// confident home pick (p = 0.85), where it belongs.
function calculateFavouriteProbability(game: EvaluatedGame): number {
  return Math.max(game.homeWinProbability, PROBABILITY_UPPER_BOUND - game.homeWinProbability);
}

// True when the prediction was written before tip-off, i.e. it was a real
// forecast rather than a backfill over a game whose result was already known.
function wasPredictedBeforeTipOff(game: EvaluatedGame): boolean {
  return game.predictionCreatedAt.getTime() < game.gameDate.getTime();
}

// Share of totalCount that matchCount represents, or null when there is
// nothing to take a share of.
function calculateShare(matchCount: number, totalCount: number): number | null {
  if (totalCount === 0) return null;
  return roundToReportedPrecision(matchCount / totalCount);
}

// Arithmetic mean of the values, or null for an empty list.
function calculateMean(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((runningTotal, value) => runningTotal + value, 0);
  return roundToReportedPrecision(total / values.length);
}

// Index of the band a favourite probability belongs to: the last band whose
// lower edge it reaches. Clamped so a value below the first edge (only
// reachable from a malformed probability outside [0, 1]) still lands in band
// 0 rather than off the front of the array.
function selectBandIndex(favouriteProbability: number): number {
  const reachedEdgeCount = CALIBRATION_BAND_LOWER_EDGES.filter(
    (lowerEdge) => favouriteProbability >= lowerEdge - BAND_EDGE_TOLERANCE
  ).length;
  return Math.max(reachedEdgeCount - 1, 0);
}

// Formats one probability edge as the percent number used in a band label.
// Rounded because 0.7 * 100 is 70.00000000000001 in binary floating point.
function formatEdgeAsPercent(probabilityEdge: number): number {
  return Math.round(probabilityEdge * PERCENTAGE_SCALE);
}

// Splits the games into one bucket per band, keeping empty buckets so the
// response always carries all five bands.
function groupGamesByBand(games: EvaluatedGame[]): EvaluatedGame[][] {
  const bandBuckets: EvaluatedGame[][] = CALIBRATION_BAND_LOWER_EDGES.map(() => []);
  games.forEach((game) => bandBuckets[selectBandIndex(calculateFavouriteProbability(game))].push(game));
  return bandBuckets;
}

// Builds the reported row for one band from the games that landed in it.
function buildCalibrationBand(lowerEdge: number, gamesInBand: EvaluatedGame[]): CalibrationBand {
  const upperEdge = Math.min(lowerEdge + CALIBRATION_BAND_WIDTH, PROBABILITY_UPPER_BOUND);
  const correctCallCount = gamesInBand.filter(didModelCallGameCorrectly).length;

  return {
    band: `${formatEdgeAsPercent(lowerEdge)}-${formatEdgeAsPercent(upperEdge)}`,
    meanPredicted: calculateMean(gamesInBand.map((game) => calculateFavouriteProbability(game))),
    actualWinRate: calculateShare(correctCallCount, gamesInBand.length),
    gamesInBand: gamesInBand.length,
  };
}

// The full ascending band list.
function buildCalibrationBands(games: EvaluatedGame[]): CalibrationBand[] {
  const bandBuckets = groupGamesByBand(games);
  return CALIBRATION_BAND_LOWER_EDGES.map((lowerEdge, bandIndex) =>
    buildCalibrationBand(lowerEdge, bandBuckets[bandIndex])
  );
}

// Scores the Elo model against the games reality has already graded it on.
//
// Every figure here is arithmetic over rows the pipeline already produces —
// final scores on Game, homeWinProbability on GamePrediction. Nothing is
// fetched and nothing is invented, and the service holds no dependencies, so
// the maths is unit-testable with no database and no app boot.
@Injectable()
export class ModelAccuracyService {
  // Turns the evaluable games into the public accuracy ledger.
  //
  // @param evaluatedGames games that have both a final score and a
  //   prediction, in any order — the report is order-independent.
  // @returns the ledger. With an empty input (or one holding only level
  //   games) gamesEvaluated and forwardPredictionCount are 0, the three rate
  //   fields are null, and all five calibration bands are present but empty.
  buildAccuracyReport(evaluatedGames: EvaluatedGame[]): ModelAccuracyReport {
    const decidedGames = evaluatedGames.filter(isDecidedGame);
    // Via the shared helper, so the leaderboard's model row and this figure
    // cannot drift apart — see summarizeModelRecord.
    const { correct: correctCallCount } = summarizeModelRecord(evaluatedGames);
    const homeWinCount = decidedGames.filter(didHomeTeamWin).length;

    return {
      accuracy: calculateShare(correctCallCount, decidedGames.length),
      brierScore: calculateMean(decidedGames.map((game) => calculateSquaredError(game))),
      homeBaselineAccuracy: calculateShare(homeWinCount, decidedGames.length),
      gamesEvaluated: decidedGames.length,
      forwardPredictionCount: decidedGames.filter(wasPredictedBeforeTipOff).length,
      calibration: buildCalibrationBands(decidedGames),
    };
  }
}
