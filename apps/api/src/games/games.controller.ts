import { Controller, Get, Query } from "@nestjs/common";
import { GamesService } from "./games.service.js";

@Controller("v1/games")
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get()
  listGames(@Query() query: Record<string, unknown>) {
    return this.gamesService.getGames(query);
  }
}
