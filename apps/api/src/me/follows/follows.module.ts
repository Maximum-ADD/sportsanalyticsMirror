import { Module } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import { FollowsController } from "./follows.controller.js";
import { FollowsWriteService } from "./follows-write.service.js";
import { TeamResultsController } from "./team-results.controller.js";
import { TeamResultsService } from "./team-results.service.js";
import { WatchlistController } from "./watchlist.controller.js";
import { WatchlistService } from "./watchlist.service.js";

// The signed-in user's followed players and teams (FollowedPlayer,
// FollowedTeam) and the two home-page views built on them:
//   /v1/me/follows/*     - writing the follow graph        (FollowsController)
//   /v1/me/watchlist     - followed players + their form   (WatchlistController)
//   /v1/me/teams/results - followed teams' recent games    (TeamResultsController)
//
// Reads and writes are separate providers on purpose: FollowsWriteService owns
// every mutation, WatchlistService and TeamResultsService only ever read.
@Module({
  controllers: [FollowsController, WatchlistController, TeamResultsController],
  providers: [FollowsWriteService, WatchlistService, TeamResultsService, SessionAuthGuard],
})
export class FollowsModule {}
