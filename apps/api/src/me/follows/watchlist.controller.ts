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
  // their derived season averages, recent points, and their own note.
  @Get()
  getWatchlist(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    return this.watchlistService.getWatchlist(request.user.id, query);
  }

  // GET /v1/me/watchlist/ids - only the followed player ids, so a follow
  // button elsewhere in the app can render its own state in one request
  // instead of paging the board. No route collides: the board is the
  // collection root and takes no path parameter.
  @Get("ids")
  getWatchedPlayerIds(@Req() request: AuthenticatedRequest) {
    return this.watchlistService.getWatchedPlayerIds(request.user.id);
  }
}
