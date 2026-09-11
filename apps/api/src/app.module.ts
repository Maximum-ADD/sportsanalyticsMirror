import { Module } from "@nestjs/common";
import { GamesModule } from "./games/games.module.js";
import { HealthController } from "./health/health.controller.js";
import { MeModule } from "./me/me.module.js";
import { NotFoundModule } from "./not-found/not-found.module.js";
import { OptimizerModule } from "./optimizer/optimizer.module.js";
import { PlayersModule } from "./players/players.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { TeamsModule } from "./teams/teams.module.js";

@Module({
  imports: [PrismaModule, PlayersModule, TeamsModule, GamesModule, OptimizerModule, MeModule, NotFoundModule],
  controllers: [HealthController],
})
export class AppModule {}
