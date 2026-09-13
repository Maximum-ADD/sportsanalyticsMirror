import { Injectable } from "@nestjs/common";
import type { Player, Prisma, SeasonType, Team } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { DEFAULT_SEASON_TYPE, parseSeasonType } from "../common/season-type.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type PlayerWithTeam = Player & { team: Team | null };

function getSearchTerms(search: unknown): string[] {
  return typeof search === "string" ? search.trim().split(/\s+/).filter(Boolean) : [];
}

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  // The filter set behind getPlayers, extracted so the ranked listing in
  // StatsService can apply exactly the same team/position/search/participation
  // narrowing before it sorts by a season stat — the two listings must never
  // drift into agreeing on what "the players matching these filters" means.
  buildPlayerWhere(query: Record<string, unknown>): Prisma.PlayerWhereInput {
    const teamId = typeof query.teamId === "string" ? query.teamId : undefined;
    const position = typeof query.position === "string" ? query.position : undefined;
    const searchTerms = getSearchTerms(query.search);
    const seasonType = parseSeasonType(query.seasonType) ?? DEFAULT_SEASON_TYPE;
    const participatedOnly = query.participated === "true";

    return {
      ...(teamId ? { teamId } : {}),
      ...(position ? { position } : {}),
      ...(participatedOnly ? { gameStats: { some: { game: { seasonType } } } } : {}),
      AND: searchTerms.map((searchTerm) => ({
        OR: [
          { firstName: { contains: searchTerm, mode: "insensitive" } },
          { lastName: { contains: searchTerm, mode: "insensitive" } },
        ],
      })),
    };
  }

  // Every player matching the list endpoint's filters, with no pagination —
  // the unit StatsService.getPlayersRanked sorts over before slicing out one
  // page. Ordered by last name so callers that don't re-sort get a stable,
  // alphabetical listing.
  getMatchingPlayers(query: Record<string, unknown>): Promise<PlayerWithTeam[]> {
    return this.prisma.player.findMany({
      where: this.buildPlayerWhere(query),
      include: { team: true },
      orderBy: { lastName: "asc" },
    });
  }

  // Paginated player list, optionally narrowed by an exact teamId and/or
  // position match. query is the raw request query string object; only the
  // recognised keys (page, pageSize, teamId, position, search, seasonType,
  // participated) have any effect.
  //
  // `participated=true` with a `seasonType` narrows the list to players who
  // actually appeared in that segment — what a postseason view wants, so an
  // eliminated team's bench doesn't pad a playoffs player list with players
  // who have no playoff numbers to show. Without `participated=true`,
  // `seasonType` alone does nothing to this list: which players exist isn't
  // a per-segment question, only which of them played is.
  async getPlayers(query: Record<string, unknown>): Promise<PagedResult<PlayerWithTeam>> {
    const { page, pageSize } = parsePageParams(query);
    const where = this.buildPlayerWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.player.findMany({
        where,
        include: { team: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { lastName: "asc" },
      }),
      this.prisma.player.count({ where }),
    ]);

    return { data, page, pageSize, total };
  }

  getPlayerById(playerId: string): Promise<PlayerWithTeam | null> {
    return this.prisma.player.findUnique({ where: { id: playerId }, include: { team: true } });
  }

  // Every player currently on a team's roster — no pagination, since a
  // roster tops out around 15-20 players and every caller so far
  // (suggested-players ranking) wants the whole thing at once rather than a
  // page of it.
  getTeamRoster(teamId: string): Promise<PlayerWithTeam[]> {
    return this.prisma.player.findMany({ where: { teamId }, include: { team: true } });
  }

  // One player's per-game boxscore rows for a single season segment,
  // newest game first. The `game.seasonType` filter is the whole isolation
  // guarantee for the postseason views: a playoffs request cannot return a
  // regular-season row because it never selects one, so no downstream
  // aggregation has to be careful about it.
  getPlayerSeasonStats(playerId: string, seasonType: SeasonType = DEFAULT_SEASON_TYPE) {
    return this.prisma.playerGameStat.findMany({
      where: { playerId, game: { seasonType } },
      include: { game: true },
      orderBy: { game: { gameDate: "desc" } },
    });
  }

  // One query for every requested player's game stats, not one query per
  // player — added once a caller (the Predictions page's model highlights,
  // via PlayerCards.tsx's useUpcomingPlayerReliability) needed reliability
  // data for ~15-30 players at once and was firing that many sequential
  // GET /v1/players/:id/stats round trips, each competing for the same
  // pooled Supabase connection. Same "one query, group in application code"
  // shape as GamesService's own upcoming/completed split.
  //
  // Without `seasonType` the rows span every segment — the historical
  // behaviour the reliability caller above relies on. Pass one to narrow
  // the batch to a single segment, the same isolation guarantee
  // getPlayerSeasonStats documents for one player.
  getPlayerSeasonStatsBatch(playerIds: string[], seasonType?: SeasonType) {
    return this.prisma.playerGameStat.findMany({
      where: { playerId: { in: playerIds }, ...(seasonType ? { game: { seasonType } } : {}) },
      include: { game: true },
      orderBy: { game: { gameDate: "desc" } },
    });
  }

  // One player's boxscore rows in one segment with both sides of each game
  // joined on — the raw material for opponent splits: the opponent is
  // whichever team the player didn't suit up for (see StatsService.get
  // MatchupProjection). Heavier than the plain game include above, so it
  // stays a separate read rather than widening every caller's row.
  getPlayerGameStatsWithOpponents(playerId: string, seasonType: SeasonType) {
    return this.prisma.playerGameStat.findMany({
      where: { playerId, game: { seasonType } },
      include: { game: { include: { homeTeam: true, awayTeam: true } } },
      orderBy: { game: { gameDate: "desc" } },
    });
  }

  // League-wide per-player totals for one segment, aggregated inside the
  // database instead of streamed row-by-row: the grouped result is a few
  // hundred rows either way, while pulling the underlying ~80k
  // regular-season boxscore rows through the hosted connection pooler
  // times out mid-query (Prisma P1017). Only the columns the ranking and
  // leaders paths read are summed — see StatsService.getSeasonStatTotalsBy
  // PlayerId.
  getSeasonStatTotalsBatch(playerIds: string[], seasonType: SeasonType) {
    return this.prisma.playerGameStat.groupBy({
      by: ["playerId"],
      where: { playerId: { in: playerIds }, game: { seasonType } },
      _count: { _all: true },
      _sum: {
        points: true,
        rebounds: true,
        assists: true,
        fieldGoalsAttempted: true,
        freeThrowsAttempted: true,
      },
    });
  }
}
