import { Module } from "@nestjs/common";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { PredictionsService } from "../predictions/predictions.service.js";
import { GameDetailService } from "./game-detail.service.js";
import { GamesController } from "./games.controller.js";
import { GamesService } from "./games.service.js";

@Module({
  controllers: [GamesController],
  providers: [GamesService, PredictionsService, GameDetailService, SessionAuthGuard],
  // GamesService is the module's public read surface — PlayersModule imports
  // it for the matchup-projection endpoint's upcoming-schedule lookup.
  exports: [GamesService],
})
export class GamesModule {}
