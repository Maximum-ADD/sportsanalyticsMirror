import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvaluatedGamesService } from "./evaluated-games.service.js";

const GAME_DATE = new Date("2026-01-10T00:00:00.000Z");
const PREDICTION_DATE = new Date("2026-01-09T00:00:00.000Z");

describe("EvaluatedGamesService", () => {
  let evaluatedGamesService: EvaluatedGamesService;
  let findMany: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findMany = vi.fn().mockResolvedValue([]);
    const prisma = { game: { findMany } } as never;
    evaluatedGamesService = new EvaluatedGamesService(prisma);
  });

  it("asks the database only for finished games that also carry a prediction", async () => {
    await evaluatedGamesService.getEvaluatedGames();

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({
      homeScore: { not: null },
      awayScore: { not: null },
      prediction: { isNot: null },
    });
  });

  it("flattens the joined rows into the shape the accuracy maths consumes", async () => {
    findMany.mockResolvedValue([
      {
        id: "game-1",
        gameDate: GAME_DATE,
        homeScore: 110,
        awayScore: 100,
        prediction: { homeWinProbability: 0.62, createdAt: PREDICTION_DATE },
      },
    ]);

    const evaluatedGames = await evaluatedGamesService.getEvaluatedGames();

    expect(evaluatedGames).toEqual([
      {
        gameId: "game-1",
        gameDate: GAME_DATE,
        homeScore: 110,
        awayScore: 100,
        homeWinProbability: 0.62,
        predictionCreatedAt: PREDICTION_DATE,
      },
    ]);
  });

  it("drops any row that still lacks a score or a prediction, rather than scoring a null", async () => {
    findMany.mockResolvedValue([
      { id: "unscored", gameDate: GAME_DATE, homeScore: null, awayScore: null, prediction: null },
      {
        id: "unpredicted",
        gameDate: GAME_DATE,
        homeScore: 110,
        awayScore: 100,
        prediction: null,
      },
      {
        id: "evaluable",
        gameDate: GAME_DATE,
        homeScore: 99,
        awayScore: 101,
        prediction: { homeWinProbability: 0.4, createdAt: PREDICTION_DATE },
      },
    ]);

    const evaluatedGames = await evaluatedGamesService.getEvaluatedGames();

    expect(evaluatedGames.map((game) => game.gameId)).toEqual(["evaluable"]);
  });

  it("returns an empty list when nothing is evaluable yet", async () => {
    findMany.mockResolvedValue([]);

    await expect(evaluatedGamesService.getEvaluatedGames()).resolves.toEqual([]);
  });
});
