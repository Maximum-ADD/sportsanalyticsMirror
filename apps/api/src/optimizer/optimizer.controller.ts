import { Controller, Get, HttpStatus, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from "@nestjs/swagger";
import { ApiException } from "../common/api-exception.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { OptimizerService } from "./optimizer.service.js";

@ApiTags("optimizer")
@Controller("v1/optimizer")
@UseGuards(SessionAuthGuard)
export class OptimizerController {
  constructor(private readonly optimizerService: OptimizerService) {}

  @Get("lineup")
  @ApiOperation({ summary: "Get latest fantasy lineup" })
  @ApiResponse({ status: 200, description: "Latest generated lineup" })
  @ApiResponse({ status: 404, description: "No lineup generated yet" })
  async getLatestLineup() {
    const lineup = await this.optimizerService.getLatestLineup();
    if (!lineup) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "No lineup has been generated yet — run predict.py then optimize.py in apps/optimizer."
      );
    }
    return lineup;
  }

  @Get("predictions")
  @ApiOperation({ summary: "Get every player's latest prediction" })
  @ApiResponse({ status: 200, description: "Latest prediction per player, player embedded" })
  async getLatestPlayerPredictions() {
    return this.optimizerService.getLatestPlayerPredictions();
  }

  @Get("predictions/:playerId")
  @ApiOperation({ summary: "Get player prediction by ID" })
  @ApiParam({ name: "playerId", description: "NBA player ID" })
  @ApiResponse({ status: 200, description: "Player prediction data" })
  @ApiResponse({ status: 404, description: "Prediction not found" })
  async getPlayerPrediction(@Param("playerId") playerId: string) {
    return this.optimizerService.getPlayerPrediction(playerId);
  }
}
