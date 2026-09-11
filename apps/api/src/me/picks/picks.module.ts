import { Module } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import { ChallengeController } from "./challenge.controller.js";
import { ChallengeService } from "./challenge.service.js";
import { PickRecordService } from "./pick-record.service.js";
import { PicksController } from "./picks.controller.js";
import { PicksService } from "./picks.service.js";

// The signed-in user's own game calls (GamePick) — /v1/me/picks and the
// /v1/me/challenge/next route that feeds them.
//
// Three services rather than one, so Create and Read stay separated:
// ChallengeService reads the next game to call, PicksService writes the call,
// PickRecordService reads the resulting head-to-head record. Only
// PicksService can write.
@Module({
  controllers: [ChallengeController, PicksController],
  providers: [ChallengeService, PicksService, PickRecordService, SessionAuthGuard],
})
export class PicksModule {}
