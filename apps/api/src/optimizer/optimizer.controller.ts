import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from "@nestjs/swagger";
import { z } from "zod";
import { ApiException } from "../common/api-exception.js";
import { ApiNotFoundError } from "../common/openapi/api-docs.decorators.js";
import { ErrorResponseDto } from "../common/openapi/error-response.dto.js";
import { parseBody } from "../common/parse-body.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { SALARY_CAP_IN_DOLLARS } from "./lineup-rules.js";
import { MAX_ALTERNATIVE_LINEUPS, SolveLineupRequestDto, SolveLineupResponseDto } from "./lineup-solve.dto.js";
import { OptimizerService } from "./optimizer.service.js";

// Bounds the request, not the rules: more than 5 locks is still accepted
// here so the solver can explain it ("you locked 6 players, but a lineup has
// only 5 slots"), which reads better than a schema error.
const MAX_LISTED_PLAYERS = 50;
const MAX_BUDGET_IN_DOLLARS = 1_000_000;

// The body of POST /v1/optimizer/solve. Every field is optional, so an
// empty body solves the default board.
const solveLineupSchema = z.object({
  budget: z.number().int().positive().max(MAX_BUDGET_IN_DOLLARS).default(SALARY_CAP_IN_DOLLARS),
  lockedPlayerIds: z.array(z.string().min(1)).max(MAX_LISTED_PLAYERS).default([]),
  excludedPlayerIds: z.array(z.string().min(1)).max(MAX_LISTED_PLAYERS).default([]),
  alternatives: z.number().int().min(0).max(MAX_ALTERNATIVE_LINEUPS).default(0),
});

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

  // POST rather than GET because the rules are a body, not a resource path.
  // Nothing is written, so it answers 200, not 201.
  @Post("solve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Solve for the best lineup under your own rules",
    description:
      "Runs the solver on demand over every player's latest projection. Locked players are in every lineup, " +
      "excluded players in none. The answer is the highest total projected fantasy points that fits the budget " +
      "and roster rules; projections are estimates, not guarantees. Ask for `alternatives` to also get the next " +
      "best lineups under the same rules, each a different set of players.",
  })
  @ApiBody({ type: SolveLineupRequestDto, required: false })
  @ApiResponse({
    status: 200,
    description: "The best lineup, then any alternatives asked for",
    type: SolveLineupResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      "Malformed body (BAD_REQUEST), or no lineup meets the rules (INFEASIBLE_LINEUP, with a message naming which rule to change)",
    type: ErrorResponseDto,
  })
  @ApiNotFoundError("No projections generated yet")
  async solveLineups(@Body() body: unknown) {
    const { alternatives, ...rules } = parseBody(solveLineupSchema, body ?? {});
    return this.optimizerService.solveLineups({ ...rules, lineupCount: alternatives + 1 });
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
