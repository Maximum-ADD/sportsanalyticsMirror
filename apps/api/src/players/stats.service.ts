import { Injectable } from "@nestjs/common";
import { SeasonType, type Game, type PlayerGameStat } from "@prisma/client";
import { DEFAULT_SEASON_TYPE } from "../common/season-type.js";
import { PlayersService, type PlayerWithTeam } from "./players.service.js";

export interface GameLogEntry {
  gameId: string;
  gameDate: Date;
  points: number;
}

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

  // Null rather than 0 when the player recorded no turnovers: a ratio with
  // a zero denominator is undefined, and 0.0 would read as the *worst*
  // possible ratio when the player in fact turned the ball over never,
  // which is the best. NBA.com reports 0.0 here; this deliberately doesn't.
  assistToTurnoverRatio: number | null;

  // Null when no game in this segment carries the figure — either the rows
  // predate the columns, or the advanced boxscore was unavailable. Callers
  // render null as "—"; a zero here would be a real measurement (an even
  // plus/minus, a 0% usage rate) rather than a missing one.
  plusMinusPerGame: number | null;
  usagePercentage: number | null;
  offensiveRating: number | null;
  defensiveRating: number | null;
}

// One derived season line per season segment, keyed by SeasonType. Keyed
// off the Prisma enum rather than spelled out as four named fields so a new
// segment in schema.prisma flows through without touching this type.
export type PlayerSeasonSplits = Record<SeasonType, DerivedSeasonAverages>;

// One player's identity plus their derived season line — the unit the
// comparison endpoint returns, one per requested player.
export interface PlayerComparisonEntry {
  player: PlayerWithTeam;
  seasonAverages: DerivedSeasonAverages;
}

function averageOf(values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return round(total / values.length);
}

function percentageOf(made: number, attempted: number): number {
  if (attempted === 0) return 0;
  return round((made / attempted) * 100);
}

function round(value: number): number {
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
const FREE_THROW_POSSESSION_WEIGHT = 0.44;

// Points per scoring possession, the "2" in TS% = PTS / (2 * TSA).
const POINTS_PER_SCORING_POSSESSION = 2;

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
  gameStats: PlayerGameStat[],
  selectValue: (stat: PlayerGameStat) => number | null
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
// plus/minus, which is a counting stat rather than a rate, so it isn't
// minutes-weighted — it's already expressed per game.
function averageOfPresentValues(
  gameStats: PlayerGameStat[],
  selectValue: (stat: PlayerGameStat) => number | null
): number | null {
  const presentValues = gameStats.map(selectValue).filter((value): value is number => value !== null);
  if (presentValues.length === 0) return null;
  return round(presentValues.reduce((sum, value) => sum + value, 0) / presentValues.length);
}

@Injectable()
export class StatsService {
  constructor(private readonly playersService: PlayersService) {}

  // Every figure here is derived from the raw per-game boxscore rows, which are
  // themselves derived from GameEvent rows — never a manually-entered total.
  deriveSeasonAverages(gameStats: PlayerGameStat[]): DerivedSeasonAverages {
    const totalFieldGoalsMade = gameStats.reduce((sum, stat) => sum + stat.fieldGoalsMade, 0);
    const totalFieldGoalsAttempted = gameStats.reduce((sum, stat) => sum + stat.fieldGoalsAttempted, 0);
    const totalThreesMade = gameStats.reduce((sum, stat) => sum + stat.threesMade, 0);
    const totalThreesAttempted = gameStats.reduce((sum, stat) => sum + stat.threesAttempted, 0);
    const totalFreeThrowsMade = gameStats.reduce((sum, stat) => sum + stat.freeThrowsMade, 0);
    const totalFreeThrowsAttempted = gameStats.reduce((sum, stat) => sum + stat.freeThrowsAttempted, 0);
    const totalPoints = gameStats.reduce((sum, stat) => sum + stat.points, 0);
    const totalAssists = gameStats.reduce((sum, stat) => sum + stat.assists, 0);
    const totalTurnovers = gameStats.reduce((sum, stat) => sum + stat.turnovers, 0);

    // Computed from season totals, not by averaging per-game percentages —
    // the same reason fieldGoalPercentage is. A 1-for-1 night and a
    // 5-for-20 night average to 52.5% per-game but are really 6-for-21.
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

  // Chronological per-game points, oldest first — feeds trend charts on the frontend.
  deriveGameLog(gameStats: (PlayerGameStat & { game: Game })[]): GameLogEntry[] {
    return [...gameStats]
      .sort((a, b) => a.game.gameDate.getTime() - b.game.gameDate.getTime())
      .map((stat) => ({ gameId: stat.gameId, gameDate: stat.game.gameDate, points: stat.points }));
  }

  async getPlayerSeasonAverages(
    playerId: string,
    seasonType: SeasonType = DEFAULT_SEASON_TYPE
  ): Promise<DerivedSeasonAverages> {
    const gameStats = await this.playersService.getPlayerSeasonStats(playerId, seasonType);
    return this.deriveSeasonAverages(gameStats);
  }

  async getPlayerGameLog(playerId: string, seasonType: SeasonType = DEFAULT_SEASON_TYPE): Promise<GameLogEntry[]> {
    const gameStats = await this.playersService.getPlayerSeasonStats(playerId, seasonType);
    return this.deriveGameLog(gameStats);
  }

  // Every segment's season line in one response, for the "how did this
  // player's performance change between the regular season and the
  // postseason" view — the question the postseason feature exists to
  // answer, and the one case where showing segments side by side is the
  // point rather than a bleed.
  //
  // A segment the player didn't appear in comes back as a zeroed line with
  // gamesPlayed: 0 rather than being omitted, so the caller renders a
  // consistent set of columns and decides for itself how to present "didn't
  // play" — see deriveSeasonAverages, which returns zeros for an empty
  // input rather than throwing.
  async getPlayerSeasonSplits(playerId: string): Promise<PlayerSeasonSplits> {
    const segments = Object.values(SeasonType);
    const averagesPerSegment = await Promise.all(
      segments.map((seasonType) => this.getPlayerSeasonAverages(playerId, seasonType))
    );

    return Object.fromEntries(
      segments.map((seasonType, index) => [seasonType, averagesPerSegment[index]])
    ) as PlayerSeasonSplits;
  }
}
