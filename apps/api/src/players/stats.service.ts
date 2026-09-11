import { Injectable } from "@nestjs/common";
import type { Game, PlayerGameStat } from "@prisma/client";
import { PlayersService, type PlayerWithTeam } from "./players.service.js";

export interface GameLogEntry {
  gameId: string;
  gameDate: Date;
  points: number;
}

// One player's identity-independent stats line — the unit the batch
// endpoint returns, one per requested player id (a player with zero
// PlayerGameStat rows still gets an entry: zeroed averages, empty log —
// same "always present, zeroed rather than omitted" contract
// deriveSeasonAverages already has for a single player, so callers never
// need to special-case a missing map entry vs. a genuinely stat-less player).
export interface PlayerStatsEntry {
  playerId: string;
  seasonAverages: DerivedSeasonAverages;
  gameLog: GameLogEntry[];
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

  async getPlayerSeasonAverages(playerId: string): Promise<DerivedSeasonAverages> {
    const gameStats = await this.playersService.getPlayerSeasonStats(playerId);
    return this.deriveSeasonAverages(gameStats);
  }

  async getPlayerGameLog(playerId: string): Promise<GameLogEntry[]> {
    const gameStats = await this.playersService.getPlayerSeasonStats(playerId);
    return this.deriveGameLog(gameStats);
  }

  // Season averages + game log for many players in one request — see
  // PlayersService.getPlayerSeasonStatsBatch for why this exists. Every
  // requested id gets an entry (zeroed/empty for a player with no stat
  // rows), in the same order as `playerIds`, so a caller can zip the
  // response back up against its own request list without a lookup.
  async getPlayerStatsBatch(playerIds: string[]): Promise<PlayerStatsEntry[]> {
    const allGameStats = await this.playersService.getPlayerSeasonStatsBatch(playerIds);

    const gameStatsByPlayerId = new Map<string, typeof allGameStats>();
    for (const stat of allGameStats) {
      const existing = gameStatsByPlayerId.get(stat.playerId);
      if (existing) existing.push(stat);
      else gameStatsByPlayerId.set(stat.playerId, [stat]);
    }

    return playerIds.map((playerId) => {
      const gameStats = gameStatsByPlayerId.get(playerId) ?? [];
      return {
        playerId,
        seasonAverages: this.deriveSeasonAverages(gameStats),
        gameLog: this.deriveGameLog(gameStats),
      };
    });
  }
}
