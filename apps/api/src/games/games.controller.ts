import { Controller, Get, HttpStatus, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from "@nestjs/swagger";
import { ApiException } from "../common/api-exception.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { PredictionsService } from "../predictions/predictions.service.js";
import { GameDetailService } from "./game-detail.service.js";
import { GamesService } from "./games.service.js";

@ApiTags("games")
@Controller("v1/games")
@UseGuards(SessionAuthGuard)
export class GamesController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly predictionsService: PredictionsService,
    private readonly gameDetailService: GameDetailService
  ) {}

  @Get()
  @ApiOperation({ summary: "List games (paginated, most recent first)" })
  @ApiResponse({ status: 200, description: "Paginated game list with predictions" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  listGames(@Query() query: Record<string, unknown>) {
    return this.gamesService.getGames(query);
  }

  // GET /v1/games/:id — a single game with its win probability/predicted
  // margin (if generated) and predicted top scorers from both rosters —
  // everything the game detail page needs in one request.
  @Get(":id")
  @ApiOperation({ summary: "Get game detail with prediction and predicted scorers" })
  @ApiParam({ name: "id", description: "Game UUID" })
  @ApiResponse({ status: 200, description: "Full game detail" })
  @ApiResponse({ status: 404, description: "Game not found" })
  async getGame(@Param("id") id: string) {
    const detail = await this.gameDetailService.getGameDetail(id);
    if (!detail) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Game not found");
    }
    return detail;
  }

  // GET /v1/games/:id/prediction — the Elo win probability and Four
  // Factors predicted margin for this game, written by apps/predictor's
  // predict_games.py. Two-step 404: game not found vs. game found but not
  // yet predicted are different problems, same pattern as
  // PlayersController's :id/stats route.
  @Get(":id/prediction")
  @ApiOperation({ summary: "Get Elo win probability and Four Factors prediction" })
  @ApiParam({ name: "id", description: "Game UUID" })
  @ApiResponse({ status: 200, description: "Game prediction" })
  @ApiResponse({ status: 404, description: "Game not found or no prediction yet" })
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
