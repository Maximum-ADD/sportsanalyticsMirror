import { Module } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import { SavedComparisonsController } from "./saved-comparisons.controller.js";
import { SavedComparisonsService } from "./saved-comparisons.service.js";

// The signed-in user's saved comparisons — /v1/me/saved. Saved lineups live
// under /v1/me/lineups instead (SavedLineupsController in the me module):
// they predate this module, carry their own drift logic, and the two halves
// share a URL prefix and nothing else.
@Module({
  controllers: [SavedComparisonsController],
  providers: [SavedComparisonsService, SessionAuthGuard],
})
export class SavedModule {}
