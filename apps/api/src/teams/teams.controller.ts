import { Controller, Get, HttpStatus, Param, Query } from "@nestjs/common";
import { ApiException } from "../common/api-exception.js";
import { TeamsService } from "./teams.service.js";

@Controller("v1/teams")
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  listTeams(@Query() query: Record<string, unknown>) {
    return this.teamsService.getTeams(query);
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
