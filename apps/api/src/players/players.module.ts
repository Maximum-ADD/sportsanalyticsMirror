import { Module } from "@nestjs/common";
import { GamesModule } from "../games/games.module.js";
import { PlayersController } from "./players.controller.js";
import { ArchetypesService } from "./archetypes.service.js";
import { PlayersService } from "./players.service.js";
import { StatsService } from "./stats.service.js";

@Module({
  imports: [GamesModule],
  controllers: [PlayersController],
  providers: [PlayersService, StatsService, ArchetypesService],
})
export class PlayersModule {}
