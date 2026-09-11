import { HttpStatus, Injectable } from "@nestjs/common";
import { ApiException } from "../../common/api-exception.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { toChallengeGame, type ChallengeGame } from "./pick-serializers.js";

// READ side of the challenge mechanic: finding the next game to put to a
// user. Creating the call that answers it belongs to PicksService, and
// reading the resulting record to PickRecordService — one service per
// operation, so nothing here can quietly acquire a write.

@Injectable()
export class ChallengeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds the next game to challenge one user with.
   *
   * @param userId - the signed-in user, from request.user.id.
   * @returns the game, its teams and the model's prediction, with the final
   *          score withheld (see toChallengeGame).
   * @throws ApiException 404 NOT_FOUND when the user has already called every
   *         eligible game.
   *
   * Eligibility is three conditions, all of them properties of rows the
   * pipeline already produces: the game has been played (both scores present,
   * so the call can be graded immediately), the predictor has an opinion on it
   * (a GamePrediction exists, so there is a model to beat), and this user has
   * not called it before. Most recent game first, matching GamesService's
   * ordering, so the games offered are the ones a user is likeliest to
   * remember watching.
   */
  async getNextChallenge(userId: string): Promise<ChallengeGame> {
    const game = await this.findNextUncalledGame(userId);
    if (!game?.prediction) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "No challenge available — you have already called every completed game the model has predicted. Check back once more games are played."
      );
    }
    return toChallengeGame(game, game.prediction);
  }

  // The query behind getNextChallenge. `picks: { none: { userId } }` does the
  // already-called filter in Postgres rather than pulling the user's picks
  // back and filtering in JS, which would scale with their history.
  //
  // The drawn-game exclusion is load-bearing, not defensive. Without it this
  // read and PicksService's write disagree: a game with equal scores passes
  // the two not-null checks and gets served, but createPick rejects it (a draw
  // has no winning team to grade against), so no GamePick row is written, so
  // `picks: { none: { userId } }` still matches it — and the very next request
  // serves the same game again, forever. The user is deadlocked on a card they
  // cannot answer. Real NBA games go to overtime rather than draw, so this is
  // about the two sides agreeing regardless of what the data contains.
  private findNextUncalledGame(userId: string) {
    return this.prisma.game.findFirst({
      where: {
        homeScore: { not: null },
        awayScore: { not: null },
        NOT: { homeScore: { equals: this.prisma.game.fields.awayScore } },
        prediction: { isNot: null },
        picks: { none: { userId } },
      },
      include: { homeTeam: true, awayTeam: true, prediction: true },
      orderBy: { gameDate: "desc" },
    });
  }
}
