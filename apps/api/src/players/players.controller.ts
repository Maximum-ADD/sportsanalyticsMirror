import { Controller, Get, HttpStatus, Param, Query } from "@nestjs/common";
import { ApiException } from "../common/api-exception.js";
import { PlayersService } from "./players.service.js";
import { StatsService } from "./stats.service.js";

@Controller("v1/players")
export class PlayersController {
  constructor(
    private readonly playersService: PlayersService,
    private readonly statsService: StatsService
  ) {}

  // GET /v1/players?teamId=&position=&search=&page=&pageSize= — paginated player list.
  @Get()
  listPlayers(@Query() query: Record<string, unknown>) {
    return this.playersService.getPlayers(query);
  }

  @Get(":id")
  async getPlayer(@Param("id") id: string) {
    const player = await this.playersService.getPlayerById(id);
    if (!player) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Player not found");
    }
    return player;
  }

  // GET /v1/players/:id/stats — season averages and points-by-game log,
  // both derived at request time from this player's PlayerGameStat rows.
  @Get(":id/stats")
  async getPlayerStats(@Param("id") id: string) {
    const player = await this.playersService.getPlayerById(id);
    if (!player) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Player not found");
    }

    const [seasonAverages, gameLog] = await Promise.all([
      this.statsService.getPlayerSeasonAverages(id),
      this.statsService.getPlayerGameLog(id),
    ]);
    return { playerId: id, seasonAverages, gameLog };
  }
}
