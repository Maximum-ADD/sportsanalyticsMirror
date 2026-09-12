import { Module } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import { SavedComparisonsController } from "./saved-comparisons.controller.js";
import { SavedComparisonsService } from "./saved-comparisons.service.js";
import { SavedLineupsController } from "./saved-lineups.controller.js";
import { SavedLineupsService } from "./saved-lineups.service.js";

// The signed-in user's saved comparisons and lineups (SavedComparison,
// SavedLineup) — /v1/me/saved. Comparisons and lineups get a controller and a
// service each: they share a URL prefix and nothing else, and the lineup half
// carries the drift logic that the comparison half has no use for.
@Module({
  controllers: [SavedComparisonsController, SavedLineupsController],
  providers: [SavedComparisonsService, SavedLineupsService, SessionAuthGuard],
})
export class SavedModule {}
