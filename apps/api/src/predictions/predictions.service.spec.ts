import { beforeEach, describe, expect, it, vi } from "vitest";
import { PredictionsService } from "./predictions.service.js";

describe("PredictionsService", () => {
  let predictionsService: PredictionsService;
  let findUnique: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findUnique = vi.fn();
    const prisma = { gamePrediction: { findUnique } } as never;
    predictionsService = new PredictionsService(prisma);
  });

  it("looks up a prediction by gameId", async () => {
    findUnique.mockResolvedValue({ id: "prediction-1", gameId: "game-1", homeWinProbability: 0.6 });

    const result = await predictionsService.getPredictionForGame("game-1");

    expect(findUnique).toHaveBeenCalledWith({ where: { gameId: "game-1" } });
    expect(result?.id).toBe("prediction-1");
  });

  it("returns null when no prediction exists for the game", async () => {
    findUnique.mockResolvedValue(null);

    const result = await predictionsService.getPredictionForGame("game-without-prediction");

    expect(result).toBeNull();
  });
});
