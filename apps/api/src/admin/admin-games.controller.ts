import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { Roles } from "../common/roles.decorator.js";
import { RolesGuard } from "../common/roles.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AdminGamesService } from "./admin-games.service.js";

// Finding a game to correct and reading its full play-by-play. The public
// /v1/games endpoints can't do either: they filter only by status, season
// and season type, and cap events at 100 per page without player names.
@ApiTags("admin")
@Controller("v1/admin/games")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminGamesController {
  constructor(private readonly adminGamesService: AdminGamesService) {}

  @Get()
  @ApiOperation({ summary: "Find games by season, team and date, with each game's event count (admin only)" })
  @ApiQuery({ name: "season", required: false, description: "e.g. 2025-26" })
  @ApiQuery({ name: "teamId", required: false, description: "Team UUID, home or away" })
  @ApiQuery({ name: "fromDate", required: false, description: "YYYY-MM-DD, inclusive" })
  @ApiQuery({ name: "toDate", required: false, description: "YYYY-MM-DD, inclusive" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Paginated games, most recent first" })
  @ApiResponse({ status: 400, description: "Malformed or inverted date window" })
  listGames(@Query() query: Record<string, unknown>) {
    return this.adminGamesService.listGames(query);
  }

  @Get(":gameId/events")
  @ApiOperation({ summary: "A game's header, every event with player names, and its roster (admin only)" })
  @ApiParam({ name: "gameId", description: "Game UUID" })
  @ApiResponse({ status: 200, description: "The game's full play-by-play" })
  @ApiResponse({ status: 404, description: "Game not found" })
  getPlayByPlay(@Param("gameId") gameId: string) {
    return this.adminGamesService.getPlayByPlay(gameId);
  }
}
