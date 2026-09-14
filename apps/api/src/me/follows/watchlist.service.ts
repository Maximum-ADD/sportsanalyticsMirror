import { Injectable } from "@nestjs/common";
import type { Player, Team } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../../common/pagination.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { takeRecentPointsByPlayerId, type RecentGamePoints } from "./recent-points.js";
import { toOptionalTeamSummary, type TeamSummary } from "./team-summary.js";
import {
  buildAveragesByPlayerId,
  EMPTY_SEASON_AVERAGES,
  type WatchlistSeasonAverages,
} from "./watchlist-averages.js";

/**
 * Reads the watchlist board: the players this user follows, each with their
 * derived season averages and their recent scoring.
 *
 * Read-only - every write to the follow graph goes through FollowsWriteService.
 *
 * The averages and the recent points are both derived from PlayerGameStat
 * boxscore rows the ingestion already produces. Nothing here calls out to an
 * NBA source, and no figure is stored: they are recomputed per request, so a
 * newly ingested game shows up immediately.
 */

// How many recent games the board's scoring trend shows per player. Five is a
// week or so of NBA schedule - enough to read a hot streak, short enough to
// stay a sparkline rather than a chart.
const RECENT_GAMES_COUNT = 5;

/** One row of the watchlist board. */
export interface WatchlistEntry {
  player: {
    id: string;
    // As on TeamSummary: our uuid is the key, the nba.com id is what the
    // headshot URL is built from.
    nbaPlayerId: number;
    firstName: string;
    lastName: string;
    position: string;
    jerseyNumber: string | null;
    headshotUrl: string | null;
    team: TeamSummary | null;
  };
  followedAt: Date;
  seasonAverages: WatchlistSeasonAverages;
  // Most recent game first. Empty for a followed player with no boxscores yet
  // (a rookie who has not debuted, or a season not yet ingested).
  recentPoints: RecentGamePoints[];
}

type FollowedPlayerWithPlayer = {
  playerId: string;
  createdAt: Date;
  player: Player & { team: Team | null };
};

@Injectable()
export class WatchlistService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds the whole watchlist board for one user.
   *
   * @param userId - the signed-in user, from the session. Every query below is
   *                 scoped to it; a user can only ever see their own board.
   * @param query - the raw request query. Only page/pageSize are read, via the
   *                shared parsePageParams (default 25, capped at 100).
   * @returns the standard pagination envelope, newest follow first.
   * @remarks Costs three queries regardless of how many players are followed:
   *          the page of follows, one grouped aggregate for the averages, and
   *          one ordered scan for the recent points. Deliberately NOT a loop
   *          over StatsService.getPlayerSeasonAverages() - that is one query
   *          per followed player, on a page that loads on every visit.
   */
  async getWatchlist(userId: string, query: Record<string, unknown>): Promise<PagedResult<WatchlistEntry>> {
    const { page, pageSize } = parsePageParams(query);

    const [follows, total] = await Promise.all([
      this.prisma.userFollowedPlayer.findMany({
        where: { userId },
        include: { player: { include: { team: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.userFollowedPlayer.count({ where: { userId } }),
    ]);

    const watchedPlayerIds = follows.map((follow) => follow.playerId);
    const [averagesByPlayerId, recentPointsByPlayerId] = await Promise.all([
      this.readSeasonAveragesByPlayerId(watchedPlayerIds),
      this.readRecentPointsByPlayerId(watchedPlayerIds),
    ]);

    const data = follows.map((follow) =>
      toWatchlistEntry(
        follow,
        averagesByPlayerId.get(follow.playerId) ?? EMPTY_SEASON_AVERAGES,
        recentPointsByPlayerId.get(follow.playerId) ?? []
      )
    );

    return { data, page, pageSize, total };
  }

  /**
   * Season averages for every watched player, in ONE aggregate query.
   *
   * @param watchedPlayerIds - the player ids on this page of the watchlist.
   * @returns a Map from playerId to averages. Players with no boxscore rows
   *          are absent from the map, not zero-filled here - the caller
   *          supplies EMPTY_SEASON_AVERAGES for those.
   * @remarks Postgres does the summing and counting; Node only divides. The
   *          totals cover the player's whole stat history, independently of
   *          the recent-games window read below, so the average never depends
   *          on how many games the sparkline happens to show.
   */
  private async readSeasonAveragesByPlayerId(
    watchedPlayerIds: string[]
  ): Promise<Map<string, WatchlistSeasonAverages>> {
    if (watchedPlayerIds.length === 0) return new Map();

    const totalsRows = await this.prisma.playerGameStat.groupBy({
      by: ["playerId"],
      where: { playerId: { in: watchedPlayerIds } },
      _sum: { points: true, rebounds: true, assists: true },
      _count: { _all: true },
    });

    return buildAveragesByPlayerId(totalsRows);
  }

  /**
   * The last RECENT_GAMES_COUNT games' points for every watched player, in ONE
   * query.
   *
   * @param watchedPlayerIds - the player ids on this page of the watchlist.
   * @returns a Map from playerId to recent games, newest first.
   * @remarks Only four columns per row are selected, and the per-player slice
   *          happens in takeRecentPointsByPlayerId - see that module for why a
   *          per-player LIMIT is not expressible here.
   */
  private async readRecentPointsByPlayerId(
    watchedPlayerIds: string[]
  ): Promise<Map<string, RecentGamePoints[]>> {
    if (watchedPlayerIds.length === 0) return new Map();

    const statRows = await this.prisma.playerGameStat.findMany({
      where: { playerId: { in: watchedPlayerIds } },
      select: { playerId: true, gameId: true, points: true, game: { select: { gameDate: true } } },
      orderBy: { game: { gameDate: "desc" } },
    });

    return takeRecentPointsByPlayerId(statRows, RECENT_GAMES_COUNT);
  }
}

function toWatchlistEntry(
  follow: FollowedPlayerWithPlayer,
  seasonAverages: WatchlistSeasonAverages,
  recentPoints: RecentGamePoints[]
): WatchlistEntry {
  return {
    player: {
      id: follow.player.id,
      nbaPlayerId: follow.player.nbaPlayerId,
      firstName: follow.player.firstName,
      lastName: follow.player.lastName,
      position: follow.player.position,
      jerseyNumber: follow.player.jerseyNumber,
      headshotUrl: follow.player.headshotUrl,
      team: toOptionalTeamSummary(follow.player.team),
    },
    followedAt: follow.createdAt,
    seasonAverages,
    recentPoints,
  };
}
