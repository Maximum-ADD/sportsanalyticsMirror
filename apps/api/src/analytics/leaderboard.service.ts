import { Injectable } from "@nestjs/common";
import { PickOutcome } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { EvaluatedGame } from "./evaluated-game.js";
import {
  MINIMUM_CALLS_REQUIRED,
  rankLeaderboard,
  type LeaderboardCandidate,
  type LeaderboardEntry,
} from "./leaderboard-ranking.js";
import { summarizeModelRecord } from "./model-accuracy.service.js";

// The name the model competes under. A leaderboard of humans with an unnamed
// row on it reads as a bug, and "the model" is what the rest of the UI calls
// it.
const MODEL_DISPLAY_NAME = "Elo model";

// Shown instead of a blank cell when a User row has no name — BetterAuth
// populates it from the Google profile, so it is present in practice, but the
// column is not guaranteed non-empty and a nameless row would sort oddly
// against localeCompare.
const UNNAMED_USER_DISPLAY_NAME = "Anonymous";

// What GET /v1/analytics/leaderboard returns.
export interface Leaderboard {
  // Echoed so a user who is absent from the board can tell WHY — "you need
  // five calls" is a different message from "you are last".
  minimumCallsRequired: number;
  entries: LeaderboardEntry[];
}

// Reads the counts behind the leaderboard. Holds no ranking arithmetic — that
// lives in leaderboard-ranking.ts and is unit-tested without a database — so
// this class has one reason to change (how the counts are fetched) and that
// module has another (how they are ordered).
@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds the accuracy leaderboard: qualifying users plus the model.
   *
   * @param evaluatedGames - the games the model can be scored on, from
   *   EvaluatedGamesService. Passed in rather than fetched here so the
   *   controller can hand the same list to both analytics routes.
   * @returns the ranked board and the qualification threshold.
   *
   * The model is always a row, even when no user qualifies — an empty board
   * with the benchmark on it still tells you something, whereas a board with
   * nothing on it looks broken.
   */
  async getLeaderboard(evaluatedGames: EvaluatedGame[]): Promise<Leaderboard> {
    const [userCandidates, modelCandidate] = await Promise.all([
      this.readUserCandidates(),
      Promise.resolve(toModelCandidate(evaluatedGames)),
    ]);

    return {
      minimumCallsRequired: MINIMUM_CALLS_REQUIRED,
      entries: rankLeaderboard([...userCandidates, modelCandidate]),
    };
  }

  /**
   * Counts every user's graded calls and correct calls.
   *
   * @returns one candidate per user who has called at least one game.
   *
   * Two groupBys and one findMany rather than reading GamePick rows and
   * tallying in Node: the counting happens in Postgres, so the data crossing
   * the wire is one row per USER instead of one per CALL. At ten thousand
   * picks across fifty users that is fifty rows rather than ten thousand, and
   * it stays fifty as the pick table grows.
   *
   * Only names for the users who actually qualify are fetched, so a database
   * full of accounts that have never called a game costs nothing here.
   */
  private async readUserCandidates(): Promise<LeaderboardCandidate[]> {
    const [callsByUser, correctByUser] = await Promise.all([
      this.prisma.gamePick.groupBy({ by: ["userId"], _count: { _all: true } }),
      this.prisma.gamePick.groupBy({
        by: ["userId"],
        where: { outcome: PickOutcome.CORRECT },
        _count: { _all: true },
      }),
    ]);

    const correctCountByUserId = new Map(
      correctByUser.map((row) => [row.userId, row._count._all])
    );

    const qualifyingUserIds = callsByUser
      .filter((row) => row._count._all >= MINIMUM_CALLS_REQUIRED)
      .map((row) => row.userId);

    const nameByUserId = await this.readDisplayNames(qualifyingUserIds);

    return callsByUser
      .filter((row) => nameByUserId.has(row.userId))
      .map((row) => ({
        kind: "user" as const,
        name: nameByUserId.get(row.userId) ?? UNNAMED_USER_DISPLAY_NAME,
        calls: row._count._all,
        correct: correctCountByUserId.get(row.userId) ?? 0,
      }));
  }

  /**
   * Looks up display names for the users about to be shown.
   *
   * @param userIds - the qualifying users only.
   * @returns userId -> display name.
   *
   * `select: { id, name }` is deliberate and load-bearing: this endpoint is
   * public, so anything selected here is readable by a signed-out visitor.
   * Selecting the whole User row would publish email addresses to the
   * internet. Do not widen it.
   */
  private async readDisplayNames(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });

    return new Map(users.map((user) => [user.id, user.name || UNNAMED_USER_DISPLAY_NAME]));
  }
}

/**
 * The model as a leaderboard competitor.
 *
 * @param evaluatedGames - games with a final score and a prediction.
 * @returns its candidate row.
 *
 * Counts come from summarizeModelRecord, the same helper the accuracy ledger
 * uses, so /v1/analytics/leaderboard and /v1/analytics/model-accuracy report
 * one number for the model rather than two that drifted apart.
 *
 * Worth being clear about what this row is and is not: it is the model's
 * record over EVERY game it predicted, while a user's row covers only the
 * games that user chose to call. Those are different denominators, so
 * finishing above the model is not by itself proof of beating it — the
 * strictly like-for-like comparison is the same-subset one on
 * GET /v1/me/picks/record, and the UI points at it for that reason.
 */
function toModelCandidate(evaluatedGames: EvaluatedGame[]): LeaderboardCandidate {
  const { calls, correct } = summarizeModelRecord(evaluatedGames);
  return { kind: "model", name: MODEL_DISPLAY_NAME, calls, correct };
}
