import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { CustomStatisticsController } from "./custom-statistics.controller.js";
import { CustomStatisticsService } from "./custom-statistics.service.js";

@Module({ imports: [PrismaModule], controllers: [CustomStatisticsController], providers: [CustomStatisticsService] })
export class CustomStatisticsModule {}
