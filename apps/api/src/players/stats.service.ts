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
