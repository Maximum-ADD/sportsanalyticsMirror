import { Controller, Get, HttpStatus, Param, Query } from "@nestjs/common";
import { ApiException } from "../common/api-exception.js";
import { PredictionsService } from "../predictions/predictions.service.js";
import { GamesService } from "./games.service.js";

@Controller("v1/games")
export class GamesController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly predictionsService: PredictionsService
  ) {}

  @Get()
  listGames(@Query() query: Record<string, unknown>) {
    return this.gamesService.getGames(query);
  }

  // GET /v1/games/:id/prediction — the Elo win probability and Four
  // Factors predicted margin for this game, written by apps/predictor's
  // predict_games.py. Two-step 404: game not found vs. game found but not
  // yet predicted are different problems, same pattern as
  // PlayersController's :id/stats route.
  @Get(":id/prediction")
  async getGamePrediction(@Param("id") id: string) {
    const game = await this.gamesService.getGameById(id);
    if (!game) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Game not found");
    }

    const prediction = await this.predictionsService.getPredictionForGame(id);
    if (!prediction) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "No prediction has been generated for this game yet — run predict_games.py in apps/predictor."
      );
    }
    return prediction;
  }
}
