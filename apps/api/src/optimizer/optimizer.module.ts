import { Module } from "@nestjs/common";
import { OptimizerController } from "./optimizer.controller.js";
import { OptimizerService } from "./optimizer.service.js";

@Module({
  controllers: [OptimizerController],
  providers: [OptimizerService],
})
export class OptimizerModule {}
