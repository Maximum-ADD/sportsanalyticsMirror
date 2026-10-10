import { Module } from "@nestjs/common";
import { AllTimeLeadersController } from "./all-time-leaders.controller.js";
import { AllTimeLeadersService } from "./all-time-leaders.service.js";

@Module({
  controllers: [AllTimeLeadersController],
  providers: [AllTimeLeadersService],
})
export class AllTimeLeadersModule {}
