import { Module } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import { TeamResultsController } from "./team-results.controller.js";
import { TeamResultsService } from "./team-results.service.js";
import { WatchlistController } from "./watchlist.controller.js";
import { WatchlistService } from "./watchlist.service.js";

// The two home-page views built on what the user follows:
//   /v1/me/watchlist     - followed players + their form   (WatchlistController)
//   /v1/me/teams/results - the favourite team's recent games (TeamResultsController)
//
// READ-ONLY. Every write to the follow graph belongs to MeService
// (src/me/me.service.ts): PUT/DELETE /v1/me/followed-players/:playerId for
// players, and PATCH /v1/me { favoriteTeamId } for the team. This module
// once had a FollowsWriteService and a second followed-players table of its
// own; both are gone, because two ways to follow a player meant a player
// followed during onboarding never appearing on the watchlist.
@Module({
  controllers: [WatchlistController, TeamResultsController],
  providers: [WatchlistService, TeamResultsService, SessionAuthGuard],
})
export class FollowsModule {}
