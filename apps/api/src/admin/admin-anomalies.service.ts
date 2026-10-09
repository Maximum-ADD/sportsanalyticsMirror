import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { findStatAnomalies, type AnomalyFinding } from "./stat-anomalies.js";
import { findHistoricalOutliers, type OutlierFinding } from "./historical-outliers.js";

// One PlayerGameStat row that failed a sanity check, alongside which player
// it belongs to and what specifically looked wrong — the admin view's unit
// of display.
export interface FlaggedPlayerGameStat {
  playerGameStatId: string;
  playerId: string;
  playerName: string;
  findings: AnomalyFinding[];
  // Separate from findings: an impossible-value hit is evidence of a bug;
  // an outlier is a normal (if rare) performance that's merely worth a
  // glance — conflating the two would present "career night" with the same
  // weight as "more made shots than attempts".
  outliers: OutlierFinding[];
}

@Injectable()
export class AdminAnomaliesService {
  constructor(private readonly prisma: PrismaService) {}

  // Runs the sanity checks (and, per player, a check against their own
  // season history) over every PlayerGameStat row for one game and returns
  // only the rows that failed at least one — a small, per-game scan rather
  // than a platform-wide one, matching how correctEvent/replayGame are
  // scoped: an admin is always looking at one game's data at a time.
  async listAnomaliesForGame(gameId: string): Promise<FlaggedPlayerGameStat[]> {
    const stats = await this.prisma.playerGameStat.findMany({
      where: { gameId },
      include: { player: { select: { firstName: true, lastName: true } }, game: { select: { season: true } } },
    });
    if (stats.length === 0) return [];

    // One query for every player's prior games in this game's season,
    // rather than one per player — a game has up to ~26 player rows, and
    // this keeps the scan at two queries total instead of 1 + N.
    const season = stats[0].game.season;
    const priorGamesByPlayerId = await this.loadPriorGamesByPlayerId(
      stats.map((stat) => stat.playerId),
      season,
      gameId,
    );

    const flagged: FlaggedPlayerGameStat[] = [];
    for (const stat of stats) {
      const findings = findStatAnomalies(stat);
      const outliers = findHistoricalOutliers(stat, priorGamesByPlayerId.get(stat.playerId) ?? []);

      if (findings.length > 0 || outliers.length > 0) {
        flagged.push({
          playerGameStatId: stat.id,
          playerId: stat.playerId,
          playerName: `${stat.player.firstName} ${stat.player.lastName}`,
          findings,
          outliers,
        });
      }
    }

    return flagged;
  }

  private async loadPriorGamesByPlayerId(
    playerIds: string[],
    season: string,
    excludingGameId: string,
  ): Promise<Map<string, { points: number; rebounds: number; assists: number; steals: number; blocks: number; turnovers: number }[]>> {
    const priorGames = await this.prisma.playerGameStat.findMany({
      where: { playerId: { in: playerIds }, game: { season, id: { not: excludingGameId } } },
      select: {
        playerId: true,
        points: true,
        rebounds: true,
        assists: true,
        steals: true,
        blocks: true,
        turnovers: true,
      },
    });

    const byPlayerId = new Map<string, (typeof priorGames)[number][]>();
    for (const game of priorGames) {
      const existing = byPlayerId.get(game.playerId);
      if (existing) existing.push(game);
      else byPlayerId.set(game.playerId, [game]);
    }
    return byPlayerId;
  }
}
