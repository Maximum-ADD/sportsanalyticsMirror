import { Module } from "@nestjs/common";
import { RolesGuard } from "../common/roles.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AvatarStorageService } from "../me/avatar-storage.service.js";
import { AdminBecomeProController } from "./admin-become-pro.controller.js";
import { BecomeProController } from "./become-pro.controller.js";
import { BecomeProService } from "./become-pro.service.js";
import { EvidenceStorageService } from "./evidence-storage.service.js";
import { MeBecomeProController } from "./me-become-pro.controller.js";
import { MeBecomeProService } from "./me-become-pro.service.js";

// Become Pro: user-submitted seasons, their valuation, and the board that
// ranks them. Three controllers because the guards differ — public reads,
// the owner's own writes, and the admin review queue — over two services
// split the same way the rest of this API splits reads from writes.
//
// AvatarStorageService is provided here as well as in MeModule rather than
// exported from it: it is stateless apart from the (global) response cache,
// and a prospect row carries its owner's avatar, so this module needs to sign
// one. The same arrangement SessionAuthGuard already has across modules.
@Module({
  controllers: [BecomeProController, MeBecomeProController, AdminBecomeProController],
  providers: [
    BecomeProService,
    MeBecomeProService,
    EvidenceStorageService,
    AvatarStorageService,
    SessionAuthGuard,
    RolesGuard,
  ],
})
export class BecomeProModule {}
