import { Controller, Get, HttpStatus, Param, Query } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from "@nestjs/swagger";
import { ApiException } from "../common/api-exception.js";
import { TeamsService } from "./teams.service.js";

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
