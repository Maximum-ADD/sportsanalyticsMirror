import { Module } from "@nestjs/common";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AvatarStorageService } from "./avatar-storage.service.js";
import { DataExportController } from "./data-export.controller.js";
import { DataExportService } from "./data-export.service.js";
import { MeController } from "./me.controller.js";
import { MeService } from "./me.service.js";
import { SavedLineupsController } from "./saved-lineups.controller.js";
import { SavedLineupsService } from "./saved-lineups.service.js";

@Module({
  controllers: [MeController, SavedLineupsController, DataExportController],
  providers: [MeService, SavedLineupsService, AvatarStorageService, DataExportService, SessionAuthGuard],
})
export class MeModule {}
