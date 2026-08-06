import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller.js";
import { NotFoundModule } from "./not-found/not-found.module.js";
import { PlayersModule } from "./players/players.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { TeamsModule } from "./teams/teams.module.js";

@Module({
  imports: [PrismaModule, PlayersModule, TeamsModule, NotFoundModule],
  controllers: [HealthController],
})
export class AppModule {}
