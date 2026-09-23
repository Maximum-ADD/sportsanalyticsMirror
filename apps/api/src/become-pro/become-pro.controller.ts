import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ApiKeyGuard } from "../common/api-key.guard.js";
import { OptionalSessionGuard } from "../common/optional-session.guard.js";
import { parsePageParams } from "../common/pagination.js";
import { parseQueryParams } from "../common/parse-body.js";
import { BecomeProService } from "./become-pro.service.js";
import { competitionLevelSchema } from "./competition-level.js";

const boardQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  level: competitionLevelSchema.optional(),
});

const prospectQuerySchema = z.object({
  seasonId: z.string().min(1).optional(),
});

/**
 * The public half of Become Pro: the value board, the prospect directory and
 * one prospect's season.
 *
 * Guarded exactly like AnalyticsController — a signed-in visitor is
 * recognised as themselves (which is what marks their own row on the board),
 * and anyone else needs the site's API key. A leaderboard nobody can see
 * until they sign in is not a leaderboard.
 */
@ApiTags("become-pro")
@Controller("v1/become-pro")
@UseGuards(OptionalSessionGuard, ApiKeyGuard)
export class BecomeProController {
  constructor(private readonly becomeProService: BecomeProService) {}

  // GET /v1/become-pro/leaderboard?page=&pageSize=&search=&level=
  @Get("leaderboard")
  @ApiOperation({ summary: "Prospects ranked by projected value" })
  @ApiResponse({ status: 200, description: "One page of the ranked board" })
  getLeaderboard(@Req() request: { user?: { id: string } }, @Query() query: Record<string, unknown>) {
    const filters = parseQueryParams(boardQuerySchema, query);
    return this.becomeProService.getLeaderboard(parsePageParams(query), filters, request.user?.id ?? null);
  }

  // GET /v1/become-pro/prospects?page=&pageSize=&search=&level= — everyone
  // with a public season, including those below the board's games floor.
  @Get("prospects")
  @ApiOperation({ summary: "Every prospect with a public season, ranked or not" })
  @ApiResponse({ status: 200, description: "One page of the prospect directory" })
  getDirectory(@Query() query: Record<string, unknown>) {
    const filters = parseQueryParams(boardQuerySchema, query);
    return this.becomeProService.getDirectory(parsePageParams(query), filters);
  }

  // GET /v1/become-pro/prospects/:username?seasonId=
  @Get("prospects/:username")
  @ApiOperation({ summary: "One prospect's season, with its derived line and valuation" })
  @ApiResponse({ status: 200, description: "The prospect profile" })
  @ApiResponse({ status: 404, description: "No such prospect, or no season to show" })
  getProspect(
    @Req() request: { user?: { id: string } },
    @Param("username") username: string,
    @Query() query: Record<string, unknown>
  ) {
    const { seasonId } = parseQueryParams(prospectQuerySchema, query);
    return this.becomeProService.getProspect(username, seasonId, request.user?.id ?? null);
  }
}
