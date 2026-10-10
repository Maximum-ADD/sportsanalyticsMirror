import { Controller, Get, HttpStatus, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AllTimeLeaderCategory } from "@prisma/client";
import { ApiKeyGuard } from "../common/api-key.guard.js";
import { OptionalSessionGuard } from "../common/optional-session.guard.js";
import { ErrorResponseDto } from "../common/openapi/error-response.dto.js";
import { ApiKeyOrSessionAccess } from "../common/openapi/api-docs.decorators.js";
import {
  AllTimeLeadersService,
  LEADERBOARD_SEASON_TYPES,
  parseLeaderboardQuery,
  type AllTimeLeaderboard,
} from "./all-time-leaders.service.js";

// Career leaders across NBA history, most of whom retired before the
// seasons this app holds — so their own route rather than a filter on
// /v1/players, whose rows are this app's players only.
@ApiTags("all-time-leaders")
@UseGuards(OptionalSessionGuard, ApiKeyGuard)
@ApiKeyOrSessionAccess()
@Controller("v1/all-time-leaders")
export class AllTimeLeadersController {
  constructor(private readonly allTimeLeadersService: AllTimeLeadersService) {}

  // GET /v1/all-time-leaders?category=POINTS&seasonType=REGULAR — one
  // category's top 20 career totals, with each player's bio.
  @Get()
  @ApiOperation({ summary: "One category's all-time career leaders, best first, with bios" })
  @ApiQuery({
    name: "category",
    required: false,
    enum: Object.values(AllTimeLeaderCategory),
    description: "Stat category. Defaults to POINTS.",
  })
  @ApiQuery({
    name: "seasonType",
    required: false,
    enum: LEADERBOARD_SEASON_TYPES,
    description: "Regular-season or playoff career totals. Defaults to REGULAR.",
  })
  @ApiResponse({ status: 200, description: "The leaderboard; empty until the ingestion has run" })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Unknown category or seasonType", type: ErrorResponseDto })
  getLeaderboard(@Query() query: Record<string, unknown>): Promise<AllTimeLeaderboard> {
    return this.allTimeLeadersService.getLeaderboard(parseLeaderboardQuery(query));
  }
}
