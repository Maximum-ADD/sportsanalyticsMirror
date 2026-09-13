import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { summarizeHeadToHeadRecord, type PickRecord } from "./pick-grading.js";

// READ side of the record: how the user has done, and how the model did on
// the same games. Kept apart from PicksService (which only creates) so the
// route that reads a record has no path to a write, and so the arithmetic can
// be exercised through summarizeHeadToHeadRecord without a database.

@Injectable()
export class PickRecordService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Totals one user's calls against the model's calls on those same games.
   *
   * @param userId - the signed-in user, from request.user.id.
   * @returns { wins, losses, total, hitRate, modelWins, modelLosses, modelHitRate }.
   *
   * Edge case - a user who has called nothing gets a zeroed record rather
   * than a 404: an empty record is a real answer for a new account, and the
   * home page would otherwise have to treat "no calls yet" as an error.
   *
   * The model's half is computed from these rows alone, never over every
   * predicted game in the database — see summarizePickRecord for why that
   * same-subset restriction is the only fair head-to-head.
   */
  async getPickRecord(userId: string): Promise<PickRecord> {
    const picks = await this.findGradedPicks(userId);
    return summarizeHeadToHeadRecord(picks);
  }

  // Every call this user has made, with just enough of each game to re-grade
  // the model on it: the two team ids and the final score. `select` rather
  // than `include` keeps the payload to the four columns the maths uses.
  private findGradedPicks(userId: string) {
    return this.prisma.gamePick.findMany({
      where: { userId },
      select: {
        outcome: true,
        modelHomeWinProbabilityAtPick: true,
        game: {
          select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
        },
      },
    });
  }
}
