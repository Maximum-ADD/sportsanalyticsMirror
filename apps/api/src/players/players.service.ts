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
    const teamId = typeof query.teamId === "string" ? query.teamId : undefined;
    const position = typeof query.position === "string" ? query.position : undefined;
    const searchTerms = getSearchTerms(query.search);
    const seasonType = parseSeasonType(query.seasonType) ?? DEFAULT_SEASON_TYPE;
    const participatedOnly = query.participated === "true";

    const where: Prisma.PlayerWhereInput = {
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
}
