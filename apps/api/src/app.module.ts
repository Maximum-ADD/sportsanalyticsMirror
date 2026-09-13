import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AdminModule } from "./admin/admin.module.js";
import { AnalyticsModule } from "./analytics/analytics.module.js";
import { OriginCheckGuard } from "./common/origin-check.guard.js";
import { GamesModule } from "./games/games.module.js";
import { HealthController } from "./health/health.controller.js";
import { FollowsModule } from "./me/follows/follows.module.js";
import { MeModule } from "./me/me.module.js";
import { PicksModule } from "./me/picks/picks.module.js";
import { SavedModule } from "./me/saved/saved.module.js";
import { NotFoundModule } from "./not-found/not-found.module.js";
import { OptimizerModule } from "./optimizer/optimizer.module.js";
import { PlayersModule } from "./players/players.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { TeamsModule } from "./teams/teams.module.js";

@Module({
  imports: [
    PrismaModule,
    PlayersModule,
    TeamsModule,
    GamesModule,
    OptimizerModule,
    AnalyticsModule,
    MeModule,
    PicksModule,
    FollowsModule,
    SavedModule,
    NotFoundModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    // Applied to every route in the app rather than per-controller: a CSRF
    // check is only worth anything if it cannot be forgotten on the one new
    // write route someone adds later. It no-ops on GET/HEAD/OPTIONS, so the
    // existing read-only surface is unaffected.
    { provide: APP_GUARD, useClass: OriginCheckGuard },
  ],
})
export class AppModule {}
