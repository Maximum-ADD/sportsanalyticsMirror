import type { PlayerGameStat } from "@prisma/client";

// The arithmetic behind every published season line, pulled out of
// StatsService so it can be unit-tested from literals and — more importantly
// — so there is exactly ONE implementation of it.
//
// A second caller arrived with Become Pro: a user's self-reported season is
// derived from their own per-game rows the same way an NBA player's is
// derived from PlayerGameStat rows. Re-implementing this for them would have
// meant two definitions of "true shooting" that could drift apart, and a
// prospect's figures would stop being comparable with the pros they are
// measured against — which is the entire point of that feature.
//
// Nothing here touches Nest, Prisma or HTTP; every function takes plain
// values and returns plain values.

export interface DerivedSeasonAverages {
  gamesPlayed: number;
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  fieldGoalsMadePerGame: number;
  fieldGoalsAttemptedPerGame: number;
  fieldGoalPercentage: number;
  threesMadePerGame: number;
  threesAttemptedPerGame: number;
  threePointPercentage: number;
  freeThrowsMadePerGame: number;
  freeThrowsAttemptedPerGame: number;
  freeThrowPercentage: number;

  // Derived here rather than stored, like every percentage above. All three
  // were verified against BoxScoreAdvancedV3's own figures during
  // development and matched to three decimal places, so computing them
  // keeps one source of truth instead of two. See apps/ingestion/games.py.
  trueShootingPercentage: number;
  effectiveFieldGoalPercentage: number;

  // Null rather than zero when undefined: a player with no turnovers has an
  // undefined assist-to-turnover ratio, not the worst possible one.
  assistToTurnoverRatio: number | null;

  // Null when no game carries the figure. A zero would be a real
  // measurement — an even plus/minus, a 0% usage rate — so these stay null
  // and render as an em dash rather than a number nobody measured.
  plusMinusPerGame: number | null;
  usagePercentage: number | null;
  offensiveRating: number | null;
  defensiveRating: number | null;
}

// The subset of PlayerGameStat this arithmetic actually reads. Declared
// structurally so a caller whose rows are not PlayerGameStat — a Become Pro
// prospect's self-reported games — can satisfy it without inventing the
// columns it does not have.
export interface DerivableGameStat {
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threesMade: number;
  threesAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  plusMinus: number | null;
  usagePercentage: number | null;
  offensiveRating: number | null;
  defensiveRating: number | null;
}

export function averageOf(values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return round(total / values.length);
}

export function percentageOf(made: number, attempted: number): number {
  if (attempted === 0) return 0;
  return round((made / attempted) * 100);
}

export function round(value: number): number {
  return Math.round(value * 10) / 10;
}

// Ratios get a second decimal place — assist-to-turnover lives in a narrow
// range (roughly 0.5-4.0) where one decimal loses real differences between
// players, unlike the per-game averages above.
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

// Free-throw weighting in the true-shooting possession estimate. 0.44 is the
// standard coefficient from Dean Oliver's work — the same constant
// apps/predictor/four_factors.py uses as FREE_THROW_POSSESSION_WEIGHT — and
// approximates that not every free throw ends a possession (and-ones, the
// first of two).
export const FREE_THROW_POSSESSION_WEIGHT = 0.44;

// Points per scoring possession, the "2" in TS% = PTS / (2 * TSA).
export const POINTS_PER_SCORING_POSSESSION = 2;

// A 3-pointer counts half again as much as a 2 in effective FG%
// (Oliver's standard formula: eFG% = (FGM + 0.5*3PM) / FGA).
const THREE_POINT_EFG_WEIGHT = 0.5;

// Averages a per-game rate over only the games that actually carry it,
// weighting each game by minutes played.
//
// Minutes-weighted rather than a plain mean because usage rate and the
// offensive/defensive ratings are rates *over playing time*: a 4-minute
// garbage-time appearance with a wild usage rate would otherwise count as
// much as a 38-minute starter's night. Returns null when no game carries
// the figure, or when every game that does had zero minutes — both mean
// "no basis to report", not "zero".
function minutesWeightedAverage(
  gameStats: DerivableGameStat[],
  selectValue: (stat: DerivableGameStat) => number | null
): number | null {
  let weightedSum = 0;
  let totalMinutes = 0;
  let sawAnyValue = false;

  for (const stat of gameStats) {
    const value = selectValue(stat);
    if (value === null) continue;
    sawAnyValue = true;
    weightedSum += value * stat.minutes;
    totalMinutes += stat.minutes;
  }

  if (!sawAnyValue || totalMinutes === 0) return null;
  return round(weightedSum / totalMinutes);
}

// Per-game average over only the games carrying the figure. Used for
// plus/minus, which is a counting stat rather than a rate, so it is not
// minutes-weighted — it is already expressed per game.
function averageOfPresentValues(
  gameStats: DerivableGameStat[],
  selectValue: (stat: DerivableGameStat) => number | null
): number | null {
  const presentValues = gameStats.map(selectValue).filter((value): value is number => value !== null);
  if (presentValues.length === 0) return null;
  return round(presentValues.reduce((sum, value) => sum + value, 0) / presentValues.length);
}

/**
 * One season line derived from a set of per-game rows.
 *
 * @param gameStats - every game in the segment, in any order.
 * @returns the derived averages; an empty list yields a zeroed line with
 *          nulls for the figures that have no basis at all, never a partial
 *          object, so callers never special-case "no games".
 *
 * Every figure here is derived from raw per-game rows — never a manually
 * entered total. Percentages come from SEASON TOTALS rather than by
 * averaging per-game percentages: a 1-for-1 night and a 5-for-20 night
 * average to 52.5% per game but are really 6-for-21.
 */
export function deriveSeasonAverages(gameStats: DerivableGameStat[]): DerivedSeasonAverages {
  const totalFieldGoalsMade = gameStats.reduce((sum, stat) => sum + stat.fieldGoalsMade, 0);
  const totalFieldGoalsAttempted = gameStats.reduce((sum, stat) => sum + stat.fieldGoalsAttempted, 0);
  const totalThreesMade = gameStats.reduce((sum, stat) => sum + stat.threesMade, 0);
  const totalThreesAttempted = gameStats.reduce((sum, stat) => sum + stat.threesAttempted, 0);
  const totalFreeThrowsMade = gameStats.reduce((sum, stat) => sum + stat.freeThrowsMade, 0);
  const totalFreeThrowsAttempted = gameStats.reduce((sum, stat) => sum + stat.freeThrowsAttempted, 0);
  const totalPoints = gameStats.reduce((sum, stat) => sum + stat.points, 0);
  const totalAssists = gameStats.reduce((sum, stat) => sum + stat.assists, 0);
  const totalTurnovers = gameStats.reduce((sum, stat) => sum + stat.turnovers, 0);

  const trueShootingAttempts =
    totalFieldGoalsAttempted + FREE_THROW_POSSESSION_WEIGHT * totalFreeThrowsAttempted;

  return {
    gamesPlayed: gameStats.length,
    minutesPerGame: averageOf(gameStats.map((stat) => stat.minutes)),
    pointsPerGame: averageOf(gameStats.map((stat) => stat.points)),
    reboundsPerGame: averageOf(gameStats.map((stat) => stat.rebounds)),
    assistsPerGame: averageOf(gameStats.map((stat) => stat.assists)),
    stealsPerGame: averageOf(gameStats.map((stat) => stat.steals)),
    blocksPerGame: averageOf(gameStats.map((stat) => stat.blocks)),
    turnoversPerGame: averageOf(gameStats.map((stat) => stat.turnovers)),
    fieldGoalsMadePerGame: averageOf(gameStats.map((stat) => stat.fieldGoalsMade)),
    fieldGoalsAttemptedPerGame: averageOf(gameStats.map((stat) => stat.fieldGoalsAttempted)),
    fieldGoalPercentage: percentageOf(totalFieldGoalsMade, totalFieldGoalsAttempted),
    threesMadePerGame: averageOf(gameStats.map((stat) => stat.threesMade)),
    threesAttemptedPerGame: averageOf(gameStats.map((stat) => stat.threesAttempted)),
    threePointPercentage: percentageOf(totalThreesMade, totalThreesAttempted),
    freeThrowsMadePerGame: averageOf(gameStats.map((stat) => stat.freeThrowsMade)),
    freeThrowsAttemptedPerGame: averageOf(gameStats.map((stat) => stat.freeThrowsAttempted)),
    freeThrowPercentage: percentageOf(totalFreeThrowsMade, totalFreeThrowsAttempted),

    trueShootingPercentage:
      trueShootingAttempts === 0
        ? 0
        : round((totalPoints / (POINTS_PER_SCORING_POSSESSION * trueShootingAttempts)) * 100),
    effectiveFieldGoalPercentage: percentageOf(
      totalFieldGoalsMade + THREE_POINT_EFG_WEIGHT * totalThreesMade,
      totalFieldGoalsAttempted
    ),
    assistToTurnoverRatio: totalTurnovers === 0 ? null : roundToTwoDecimals(totalAssists / totalTurnovers),

    plusMinusPerGame: averageOfPresentValues(gameStats, (stat) => stat.plusMinus),
    usagePercentage: minutesWeightedAverage(gameStats, (stat) => stat.usagePercentage),
    offensiveRating: minutesWeightedAverage(gameStats, (stat) => stat.offensiveRating),
    defensiveRating: minutesWeightedAverage(gameStats, (stat) => stat.defensiveRating),
  };
}

// PlayerGameStat satisfies DerivableGameStat structurally; this alias exists
// so call sites reading NBA rows stay self-documenting.
export type NbaGameStat = PlayerGameStat;
