import { Module } from "@nestjs/common";
import { PlayersController } from "./players.controller.js";
import { PlayersService } from "./players.service.js";
import { StatsService } from "./stats.service.js";

@Module({
  controllers: [PlayersController],
  providers: [PlayersService, StatsService],
})
export class PlayersModule {}
