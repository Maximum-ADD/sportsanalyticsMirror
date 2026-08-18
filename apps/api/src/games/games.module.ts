import { Module } from "@nestjs/common";
import { PredictionsService } from "../predictions/predictions.service.js";
import { GamesController } from "./games.controller.js";
import { GamesService } from "./games.service.js";

@Module({
  controllers: [GamesController],
  providers: [GamesService, PredictionsService],
})
export class GamesModule {}
