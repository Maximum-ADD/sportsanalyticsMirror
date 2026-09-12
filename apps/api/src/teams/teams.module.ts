import { Module } from "@nestjs/common";
import { GamesModule } from "../games/games.module.js";
import { PlayersService } from "../players/players.service.js";
import { StatsService } from "../players/stats.service.js";
import { TeamsController } from "./teams.controller.js";
import { TeamsService } from "./teams.service.js";

// GamesModule is imported (not GamesService re-provided) because Stats
// Service — provided here for the suggested-players read — now takes
// GamesService as a constructor dependency (see PlayersModule).
@Module({
  imports: [GamesModule],
  controllers: [TeamsController],
  providers: [TeamsService, PlayersService, StatsService],
})
export class TeamsModule {}
