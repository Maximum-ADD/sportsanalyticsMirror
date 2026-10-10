import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller.js";
import { EvaluatedGamesService } from "./evaluated-games.service.js";
import { LeaderboardService } from "./leaderboard.service.js";
import { ModelAccuracyService } from "./model-accuracy.service.js";

// Read-only, derived-from-existing-rows analytics for the home page
// (aggregations over Game/PlayerGameStat/GamePrediction/PlayerPrediction —
// no new ingestion, no new data source). Controllers and services are added
// by the analytics slice; the module exists up front so that slice never has
// to edit app.module.ts alongside anyone else.
@Module({
  controllers: [AnalyticsController],
  providers: [EvaluatedGamesService, ModelAccuracyService, LeaderboardService],
})
export class AnalyticsModule {}
