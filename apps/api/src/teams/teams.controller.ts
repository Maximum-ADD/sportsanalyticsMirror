import { Controller, Get, HttpStatus, Param, Query } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from "@nestjs/swagger";
import { ApiException } from "../common/api-exception.js";
import { TeamsService, type SuggestedPlayer } from "./teams.service.js";

// Upper bound on the onboarding step's "suggested players" prompt — see
// TeamsService.getSuggestedPlayers' own doc comment for why ranking by
// usage percentage in the first place.
const MAX_SUGGESTED_PLAYERS = 20;

@ApiTags("teams")
@Controller("v1/teams")
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  // GET /v1/teams?search=&page=&pageSize= — paginated team list.
  @Get()
  @ApiOperation({ summary: "List teams (paginated)" })
  @ApiQuery({ name: "search", required: false, description: "Search by team name, city, or abbreviation" })
  @ApiQuery({ name: "page", required: false, type: Number, description: "Page number" })
  @ApiQuery({ name: "pageSize", required: false, type: Number, description: "Items per page (default: 25, max: 100)" })
  @ApiResponse({ status: 200, description: "Paginated team list" })
  listTeams(@Query() query: Record<string, unknown>) {
    return this.teamsService.getTeams(query);
  }

  // GET /v1/teams/elo-ratings — every team's current Elo rating, highest
  // first. Declared before the :id route below so "elo-ratings" isn't
  // swallowed as a team id — Nest matches routes in declaration order.
  @Get("elo-ratings")
  listEloRatings() {
    return this.teamsService.getEloRatings();
  }

  // GET /v1/teams/records — every team's win/loss record and recent form,
  // derived from completed games. Declared before the :id route below for
  // the same reason elo-ratings is.
  @Get("records")
  @ApiOperation({ summary: "Get every team's win/loss record and recent form" })
  @ApiResponse({ status: 200, description: "Team records" })
  listTeamRecords() {
    return this.teamsService.getTeamRecords();
  }

  // GET /v1/teams/:id/suggested-players?count= — a team's current roster
  // ranked by usage percentage, highest first. Backs the onboarding step's
  // "suggested players to follow" prompt (see TeamsService.getSuggestedPlayers).
  // Declared before the plain :id route below so "suggested-players" on a
  // *different* team id path segment still routes correctly — Nest matches
  // ":id/suggested-players" only when both segments are present, so ordering
  // relative to ":id" alone doesn't actually matter here, but kept above it
  // anyway to group the two team-scoped detail routes together.
  @Get(":id/suggested-players")
  @ApiOperation({ summary: "Get a team's roster ranked by usage percentage" })
  @ApiParam({ name: "id", description: "Team UUID" })
  @ApiQuery({ name: "count", required: false, type: Number, description: "Max players to return (default 8, max 20)" })
  @ApiResponse({ status: 200, description: "Ranked roster players" })
  @ApiResponse({ status: 404, description: "Team not found" })
  async getSuggestedPlayers(
    @Param("id") id: string,
    @Query("count") rawCount: unknown
  ): Promise<{ players: SuggestedPlayer[] }> {
    const team = await this.teamsService.getTeamById(id);
    if (!team) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Team not found");
    }

    const requestedCount = Number(rawCount);
    const count = Number.isFinite(requestedCount) && requestedCount > 0 ? Math.min(MAX_SUGGESTED_PLAYERS, requestedCount) : undefined;
    const players = await this.teamsService.getSuggestedPlayers(id, count);
    return { players };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get team by ID" })
  @ApiParam({ name: "id", description: "Team UUID" })
  @ApiResponse({ status: 200, description: "Team details" })
  @ApiResponse({ status: 404, description: "Team not found" })
  async getTeam(@Param("id") id: string) {
    const team = await this.teamsService.getTeamById(id);
    if (!team) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Team not found");
    }
    return team;
  }
}
