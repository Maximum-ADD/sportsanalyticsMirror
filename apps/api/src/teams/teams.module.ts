import { Module } from "@nestjs/common";
import { PlayersService } from "../players/players.service.js";
import { StatsService } from "../players/stats.service.js";
import { TeamsController } from "./teams.controller.js";
import { TeamsService } from "./teams.service.js";

@Module({
  controllers: [TeamsController],
  providers: [TeamsService, PlayersService, StatsService],
})
export class TeamsModule {}
