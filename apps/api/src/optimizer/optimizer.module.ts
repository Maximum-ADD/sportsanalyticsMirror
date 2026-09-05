import { Module } from "@nestjs/common";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { OptimizerController } from "./optimizer.controller.js";
import { OptimizerService } from "./optimizer.service.js";

@Module({
  controllers: [OptimizerController],
  providers: [OptimizerService, SessionAuthGuard],
})
export class OptimizerModule {}
