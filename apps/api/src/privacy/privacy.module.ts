import { Module } from "@nestjs/common";
import { DataRetentionService } from "./data-retention.service.js";

// Scheduling is switched on app-wide by ScheduleModule.forRoot() in
// AdminModule, so the retention job's @Cron needs nothing more here.
@Module({
  providers: [DataRetentionService],
})
export class PrivacyModule {}
