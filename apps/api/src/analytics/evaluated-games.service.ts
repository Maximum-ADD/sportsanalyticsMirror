import { Injectable } from "@nestjs/common";
import type { EvaluatedGame } from "./evaluated-game.js";
import { PrismaService } from "../prisma/prisma.service.js";

// The Game row shape this service selects: just the columns the accuracy
// maths needs, with the game's prediction joined on. Scores are nullable in
// the schema (a scheduled game has none yet) and the relation is optional,
// so the row type keeps those nulls and toEvaluatedGame is what removes them.
interface ScoredGameRow {
  id: string;
  gameDate: Date;
  homeScore: number | null;
  awayScore: number | null;
  prediction: { homeWinProbability: number; createdAt: Date } | null;
}

// Flattens one joined row into an EvaluatedGame, or returns null when the row
// cannot be scored. The null branch is defensive: the query already filters
// these rows out, but it is what narrows the nullable columns for the type
// checker rather than asserting them away with a cast.
function toEvaluatedGame(row: ScoredGameRow): EvaluatedGame | null {
  if (row.homeScore === null || row.awayScore === null || row.prediction === null) return null;

  return {
    gameId: row.id,
    gameDate: row.gameDate,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    homeWinProbability: row.prediction.homeWinProbability,
    predictionCreatedAt: row.prediction.createdAt,
  };
}

// Type guard that drops the unscoreable rows from the mapped list.
function isEvaluatedGame(game: EvaluatedGame | null): game is EvaluatedGame {
  return game !== null;
}

// Reads the games the model can be scored on. Kept apart from
// ModelAccuracyService so that the arithmetic has no database dependency and
// this class has no arithmetic: one reason to change each.
@Injectable()
export class EvaluatedGamesService {
  constructor(private readonly prisma: PrismaService) {}

  // Every finished game that also carries a GamePrediction.
  //
  // Both halves of the filter matter: a game with no final score has no
  // answer to mark the prediction against, and a finished game the predictor
  // never covered says nothing about the model. Ordered oldest-first purely
  // so repeated calls return a stable list.
  //
  // @returns the evaluable games, empty when the predictor has not run or no
  //   predicted game has finished yet.
  async getEvaluatedGames(): Promise<EvaluatedGame[]> {
    const scoredGameRows = await this.prisma.game.findMany({
      where: {
        homeScore: { not: null },
        awayScore: { not: null },
        prediction: { isNot: null },
      },
      select: {
        id: true,
        gameDate: true,
        homeScore: true,
        awayScore: true,
        prediction: { select: { homeWinProbability: true, createdAt: true } },
      },
      orderBy: { gameDate: "asc" },
    });

    return scoredGameRows.map(toEvaluatedGame).filter(isEvaluatedGame);
  }
}
