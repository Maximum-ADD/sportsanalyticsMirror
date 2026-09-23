import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import type { AuthenticatedRequest } from "./authenticated-request.js";
import { TeamResultsService } from "./team-results.service.js";

/**
 * The "your teams" strip on the home page: how the teams this user follows
 * have actually been doing, told from their side of each game.
 */
@Controller("v1/me/teams")
@UseGuards(SessionAuthGuard)
export class TeamResultsController {
  constructor(private readonly teamResultsService: TeamResultsService) {}

  // GET /v1/me/teams/results - recent completed games for the user's followed
  // teams, each oriented to their team (yourTeam/opponent, yourScore/
  // opponentScore, won) with the model's call flipped to match.
  @Get("results")
  getFollowedTeamResults(@Req() request: AuthenticatedRequest) {
    return this.teamResultsService.getFollowedTeamResults(request.user.id);
  }
}
