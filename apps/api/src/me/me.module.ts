import { Module } from "@nestjs/common";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AvatarStorageService } from "./avatar-storage.service.js";
import { MeController } from "./me.controller.js";
import { MeService } from "./me.service.js";
import { SavedLineupsController } from "./saved-lineups.controller.js";
import { SavedLineupsService } from "./saved-lineups.service.js";

@Module({
  controllers: [MeController, SavedLineupsController],
  providers: [MeService, SavedLineupsService, AvatarStorageService, SessionAuthGuard],
})
export class MeModule {}
