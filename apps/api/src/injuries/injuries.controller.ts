import { Controller, Get, HttpStatus, Param, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ApiException } from "../common/api-exception.js";
import { ApiKeyGuard } from "../common/api-key.guard.js";
import { OptionalSessionGuard } from "../common/optional-session.guard.js";
import { ApiKeyOrSessionAccess } from "../common/openapi/api-docs.decorators.js";
import { InjuryFeedUnavailableError } from "./injury-feed-unavailable.error.js";
import {
  InjuriesService,
  type InjuryReport,
  type PlayerInjuryReport,
  type TeamInjuryReport,
} from "./injuries.service.js";

const UNAVAILABLE_DESCRIPTION = "ESPN's injury report is unavailable";

// Injuries from ESPN's league-wide report, matched to this app's teams and
// players. Unlike the live games feed, every read here touches the database
// (to match names), so it takes the usual session-or-API-key guards.
// The team and player routes sit under their own resources so a page reads
// them as one more thing about that team or player.
@ApiTags("injuries")
@UseGuards(OptionalSessionGuard, ApiKeyGuard)
@ApiKeyOrSessionAccess()
@Controller("v1")
export class InjuriesController {
  constructor(private readonly injuriesService: InjuriesService) {}

  // GET /v1/injuries: every team's injured players, by city.
  @Get("injuries")
  @ApiOperation({ summary: "League-wide injury report from ESPN, by team (return dates are ESPN's estimates)" })
  @ApiResponse({ status: 200, description: "Teams with at least one injury, each with its injured players" })
  @ApiResponse({ status: 503, description: UNAVAILABLE_DESCRIPTION })
  getLeagueReport(): Promise<InjuryReport> {
    return readInjuryFeed(() => this.injuriesService.getLeagueReport());
  }

  // GET /v1/teams/:id/injuries: one team's injured players.
  @Get("teams/:id/injuries")
  @ApiOperation({ summary: "One team's injured players, from ESPN's injury report" })
  @ApiParam({ name: "id", description: "Team UUID" })
  @ApiResponse({ status: 200, description: "The team's injured players; an empty list when none" })
  @ApiResponse({ status: 404, description: "Team not found" })
  @ApiResponse({ status: 503, description: UNAVAILABLE_DESCRIPTION })
  async getTeamInjuries(@Param("id") teamId: string): Promise<TeamInjuryReport> {
    const report = await readInjuryFeed(() => this.injuriesService.getTeamInjuries(teamId));
    if (!report) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Team not found");
    return report;
  }

  // GET /v1/players/:id/injury: one player's injury, or null when they aren't on the report.
  @Get("players/:id/injury")
  @ApiOperation({ summary: "One player's injury from ESPN's injury report, or null" })
  @ApiParam({ name: "id", description: "Player UUID" })
  @ApiResponse({ status: 200, description: "The player's injury, or null when they aren't on the report" })
  @ApiResponse({ status: 503, description: UNAVAILABLE_DESCRIPTION })
  getPlayerInjury(@Param("id") playerId: string): Promise<PlayerInjuryReport> {
    return readInjuryFeed(() => this.injuriesService.getPlayerInjury(playerId));
  }
}

/**
 * Runs an injury report read, reporting an ESPN outage in the API's error envelope.
 *
 * @throws ApiException 503 INJURY_DATA_UNAVAILABLE when ESPN's report can't be
 *   read or has changed format; any other error passes through unchanged.
 */
async function readInjuryFeed<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof InjuryFeedUnavailableError)) throw error;
    throw new ApiException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "INJURY_DATA_UNAVAILABLE",
      `Injury data is unavailable right now. ${error.message}`
    );
  }
}
