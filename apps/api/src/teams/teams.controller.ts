import { Controller, Get, HttpStatus, Param, Query } from "@nestjs/common";
import { ApiException } from "../common/api-exception.js";
import { TeamsService } from "./teams.service.js";

@Controller("v1/teams")
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  // GET /v1/teams?search=&page=&pageSize= — paginated team list.
  @Get()
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
  async getTeam(@Param("id") id: string) {
    const team = await this.teamsService.getTeamById(id);
    if (!team) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Team not found");
    }
    return team;
  }
}
