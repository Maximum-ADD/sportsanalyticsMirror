import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type Game, type GamePick, type GamePrediction, type PickOutcome } from "@prisma/client";
import { ApiException } from "../../common/api-exception.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { determineWinningTeamId, gradePickAgainstWinner } from "./pick-grading.js";
import { toGradedPickResult, type DecidedGame, type GradedPickResult } from "./pick-serializers.js";

// CREATE side of the challenge mechanic, and the only write in this slice.
// Reads live in ChallengeService and PickRecordService; this service never
// updates or deletes a pick, because a call is a commitment — the @@unique
// on (userId, gameId) is what makes it one, and the 409 below is what tells
// a caller they have already committed.

// Prisma's error code for a unique constraint violation. Named so the catch
// below reads as intent rather than as a string nobody can look up.
const UNIQUE_CONSTRAINT_VIOLATION_CODE = "P2002";

// A game loaded for validation: its teams are needed to check the call, its
// prediction to snapshot, its score to grade.
type GameForPick = Game & { prediction: GamePrediction | null };

// The validated body of POST /v1/me/picks.
export interface CreatePickInput {
  gameId: string;
  pickedTeamId: string;
}

@Injectable()
export class PicksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records one user's call on one game and grades it immediately.
   *
   * @param userId - the signed-in user, from request.user.id.
   * @param input - the validated { gameId, pickedTeamId } body.
   * @returns the stored call, its grading, the now-released final score and
   *          how the model's own call fared.
   * @throws ApiException 404 NOT_FOUND when the game does not exist;
   *         400 BAD_REQUEST when the picked team is not playing in it, when
   *         the model has not predicted it, or when it has no decided final
   *         score; 409 CONFLICT when this user has already called it.
   */
  async createPick(userId: string, input: CreatePickInput): Promise<GradedPickResult> {
    const game = await this.findGameOrThrow(input.gameId);
    assertTeamPlaysInGame(game, input.pickedTeamId);
    const prediction = requirePrediction(game);
    const { decidedGame, winningTeamId } = requireDecidedResult(game);
    const outcome = gradePickAgainstWinner(input.pickedTeamId, winningTeamId);
    const pick = await this.insertPick(userId, input, prediction, outcome);
    return toGradedPickResult(pick, decidedGame, winningTeamId);
  }

  // Loads the game a call names, or reports it missing.
  private async findGameOrThrow(gameId: string): Promise<GameForPick> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { prediction: true },
    });
    if (!game) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Game not found");
    }
    return game;
  }

  // Writes the call, copying the model's current numbers into the snapshot
  // columns so this row still answers "what was the model saying when I
  // disagreed with it?" after the predictor next overwrites GamePrediction.
  private async insertPick(
    userId: string,
    input: CreatePickInput,
    prediction: GamePrediction,
    outcome: PickOutcome
  ): Promise<GamePick> {
    try {
      return await this.prisma.gamePick.create({
        data: {
          userId,
          gameId: input.gameId,
          pickedTeamId: input.pickedTeamId,
          outcome,
          modelHomeWinProbabilityAtPick: prediction.homeWinProbability,
          modelPredictedMarginAtPick: prediction.predictedMarginHome,
          homeTeamEloAtPick: prediction.homeTeamEloPre,
          awayTeamEloAtPick: prediction.awayTeamEloPre,
        },
      });
    } catch (error) {
      throw translatePickWriteError(error);
    }
  }
}

/**
 * Rejects a call on a team that is not playing in the game.
 *
 * @param game - the game being called.
 * @param pickedTeamId - the team id from the request body.
 * @throws ApiException 400 BAD_REQUEST when the team is neither side.
 *
 * GamePick.pickedTeamId is a plain column with no foreign key to Team, so
 * this check is the only thing standing between the column and an arbitrary
 * string. It is deliberately stricter than a foreign key would be: a real but
 * uninvolved team would satisfy an FK and still be a nonsense call.
 */
function assertTeamPlaysInGame(game: Game, pickedTeamId: string): void {
  if (pickedTeamId === game.homeTeamId || pickedTeamId === game.awayTeamId) {
    return;
  }
  throw new ApiException(
    HttpStatus.BAD_REQUEST,
    "BAD_REQUEST",
    "pickedTeamId must be one of the two teams playing in this game"
  );
}

/**
 * Requires a game to have a model prediction to disagree with.
 *
 * @param game - the game being called, with its prediction relation loaded.
 * @returns that prediction.
 * @throws ApiException 400 BAD_REQUEST when the predictor has not covered the game.
 *
 * Without a prediction there is no model call to snapshot, so the head-to-head
 * record would have a game the user was scored on and the model was not.
 */
function requirePrediction(game: GameForPick): GamePrediction {
  if (!game.prediction) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      "BAD_REQUEST",
      "This game has no model prediction, so there is nothing to call it against"
    );
  }
  return game.prediction;
}

/**
 * Requires a game to have been played to a result, narrowing its nullable
 * score columns away and naming the winner in one step.
 *
 * @param game - the game being called.
 * @returns the game's teams and both final scores, non-null, plus the id of
 *          the team that won.
 * @throws ApiException 400 BAD_REQUEST when the game has not been played to a
 *         decided result.
 *
 * Calls are graded the moment they are made, which is only possible on a game
 * that already has a winner — this slice scores recall of past games, not
 * forecasts of future ones. See determineWinningTeamId for why an equal score
 * counts as undecided. Returning the winner alongside the narrowed game keeps
 * the caller from re-deriving it and then having to re-prove it is not null.
 */
function requireDecidedResult(game: Game): { decidedGame: DecidedGame; winningTeamId: string } {
  const winningTeamId = determineWinningTeamId(game);
  if (winningTeamId === null || game.homeScore === null || game.awayScore === null) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      "BAD_REQUEST",
      "This game has no decided final score yet, so a call on it cannot be graded"
    );
  }
  const decidedGame = {
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
  };
  return { decidedGame, winningTeamId };
}

/**
 * Converts a failed pick insert into this API's error envelope.
 *
 * @param error - whatever the Prisma client threw.
 * @returns the ApiException to throw in its place.
 *
 * The case worth translating is the @@unique([userId, gameId]) violation: two
 * calls on one game by one person. Letting Prisma's own error escape would
 * surface as a 500 and would leak the constraint name and table structure
 * into the response, so it becomes a plain 409. Anything else is rethrown
 * untouched for AllExceptionsFilter to handle as a genuine server fault.
 */
function translatePickWriteError(error: unknown): unknown {
  const isDuplicatePick =
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION_CODE;
  if (!isDuplicatePick) {
    return error;
  }
  return new ApiException(
    HttpStatus.CONFLICT,
    "CONFLICT",
    "You have already called this game — a call is a commitment and cannot be changed"
  );
}
