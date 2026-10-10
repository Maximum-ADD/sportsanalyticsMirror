import { Module } from "@nestjs/common";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { BecomeProService } from "./become-pro.service.js";
import { MeBecomeProController } from "./me-become-pro.controller.js";
import { MeBecomeProService } from "./me-become-pro.service.js";
import { ProspectValuationService } from "./prospect-valuation.service.js";

// Become Pro: a user's own self-reported seasons, valued against the NBA
// rookie scale and compared with real NBA rookies. Private to each user, so a
// single session-guarded controller covers all of it — there is no public
// read, no leaderboard and no admin review, because no user ever sees another
// user's data.
@Module({
  controllers: [MeBecomeProController],
  providers: [BecomeProService, MeBecomeProService, ProspectValuationService, SessionAuthGuard],
})
export class BecomeProModule {}
