import type { Game, PlayerGameStat } from "@prisma/client";
import * as playerService from "./playerService.js";

export interface GameLogEntry {
  gameId: string;
  gameDate: Date;
  points: number;
}

export interface DerivedSeasonAverages {
  gamesPlayed: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  fieldGoalPercentage: number;
  threePointPercentage: number;
  freeThrowPercentage: number;
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

// Every figure here is derived from the raw per-game boxscore rows, which are
// themselves derived from GameEvent rows — never a manually-entered total.
export function deriveSeasonAverages(gameStats: PlayerGameStat[]): DerivedSeasonAverages {
  const totalFieldGoalsMade = gameStats.reduce((sum, stat) => sum + stat.fieldGoalsMade, 0);
  const totalFieldGoalsAttempted = gameStats.reduce((sum, stat) => sum + stat.fieldGoalsAttempted, 0);
  const totalThreesMade = gameStats.reduce((sum, stat) => sum + stat.threesMade, 0);
  const totalThreesAttempted = gameStats.reduce((sum, stat) => sum + stat.threesAttempted, 0);
  const totalFreeThrowsMade = gameStats.reduce((sum, stat) => sum + stat.freeThrowsMade, 0);
  const totalFreeThrowsAttempted = gameStats.reduce((sum, stat) => sum + stat.freeThrowsAttempted, 0);

  return {
    gamesPlayed: gameStats.length,
    pointsPerGame: averageOf(gameStats.map((stat) => stat.points)),
    reboundsPerGame: averageOf(gameStats.map((stat) => stat.rebounds)),
    assistsPerGame: averageOf(gameStats.map((stat) => stat.assists)),
    stealsPerGame: averageOf(gameStats.map((stat) => stat.steals)),
    blocksPerGame: averageOf(gameStats.map((stat) => stat.blocks)),
    turnoversPerGame: averageOf(gameStats.map((stat) => stat.turnovers)),
    fieldGoalPercentage: percentageOf(totalFieldGoalsMade, totalFieldGoalsAttempted),
    threePointPercentage: percentageOf(totalThreesMade, totalThreesAttempted),
    freeThrowPercentage: percentageOf(totalFreeThrowsMade, totalFreeThrowsAttempted),
  };
}

// Chronological per-game points, oldest first — feeds trend charts on the frontend.
export function deriveGameLog(gameStats: (PlayerGameStat & { game: Game })[]): GameLogEntry[] {
  return [...gameStats]
    .sort((a, b) => a.game.gameDate.getTime() - b.game.gameDate.getTime())
    .map((stat) => ({ gameId: stat.gameId, gameDate: stat.game.gameDate, points: stat.points }));
}

export async function getPlayerSeasonAverages(playerId: string): Promise<DerivedSeasonAverages> {
  const gameStats = await playerService.getPlayerSeasonStats(playerId);
  return deriveSeasonAverages(gameStats);
}

export async function getPlayerGameLog(playerId: string): Promise<GameLogEntry[]> {
  const gameStats = await playerService.getPlayerSeasonStats(playerId);
  return deriveGameLog(gameStats);
}
