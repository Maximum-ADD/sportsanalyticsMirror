import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { findStatAnomalies, type AnomalyFinding } from "./stat-anomalies.js";

// One PlayerGameStat row that failed a sanity check, alongside which player
// it belongs to and what specifically looked wrong — the admin view's unit
// of display.
export interface FlaggedPlayerGameStat {
  playerGameStatId: string;
  playerId: string;
  playerName: string;
  findings: AnomalyFinding[];
}

@Injectable()
export class AdminAnomaliesService {
  constructor(private readonly prisma: PrismaService) {}

  // Runs the sanity checks over every PlayerGameStat row for one game and
  // returns only the rows that failed at least one — a small, per-game scan
  // rather than a platform-wide one, matching how correctEvent/replayGame
  // are scoped: an admin is always looking at one game's data at a time.
  async listAnomaliesForGame(gameId: string): Promise<FlaggedPlayerGameStat[]> {
    const stats = await this.prisma.playerGameStat.findMany({
      where: { gameId },
      include: { player: { select: { firstName: true, lastName: true } } },
    });

    const flagged: FlaggedPlayerGameStat[] = [];
    for (const stat of stats) {
      const findings = findStatAnomalies(stat);
      if (findings.length > 0) {
        flagged.push({
          playerGameStatId: stat.id,
          playerId: stat.playerId,
          playerName: `${stat.player.firstName} ${stat.player.lastName}`,
          findings,
        });
      }
    }

    return flagged;
  }
}
