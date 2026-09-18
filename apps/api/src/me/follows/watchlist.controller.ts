import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import type { AuthenticatedRequest } from "./authenticated-request.js";
import { WatchlistService } from "./watchlist.service.js";

/**
 * The watchlist board on the home page: who the signed-in user is following,
 * and how those players are actually doing.
 */
@Controller("v1/me/watchlist")
@UseGuards(SessionAuthGuard)
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  // GET /v1/me/watchlist?page=&pageSize= - the user's followed players with
  // their derived season averages and recent points.
  //
  // This is the only thing the board needs that GET /v1/me does not already
  // give it: that route returns WHO you follow, this one returns how those
  // players are actually doing. Deliberately not folded into /v1/me, which
  // is read on every page and should not pay for two aggregate queries.
  @Get()
  getWatchlist(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    return this.watchlistService.getWatchlist(request.user.id, query);
  }
}
