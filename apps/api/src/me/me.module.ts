import { Module } from "@nestjs/common";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AvatarStorageService } from "./avatar-storage.service.js";
import { MeController } from "./me.controller.js";
import { MeService } from "./me.service.js";

@Module({
  controllers: [MeController],
  providers: [MeService, AvatarStorageService, SessionAuthGuard],
})
export class MeModule {}
