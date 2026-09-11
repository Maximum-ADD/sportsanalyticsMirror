import { Injectable } from "@nestjs/common";
import type { Player, Prisma, Team } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
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
  // recognised keys (page, pageSize, teamId, position, search) have any effect.
  async getPlayers(query: Record<string, unknown>): Promise<PagedResult<PlayerWithTeam>> {
    const { page, pageSize } = parsePageParams(query);
    const teamId = typeof query.teamId === "string" ? query.teamId : undefined;
    const position = typeof query.position === "string" ? query.position : undefined;
    const searchTerms = getSearchTerms(query.search);

    const where: Prisma.PlayerWhereInput = {
      ...(teamId ? { teamId } : {}),
      ...(position ? { position } : {}),
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

  getPlayerSeasonStats(playerId: string) {
    return this.prisma.playerGameStat.findMany({
      where: { playerId },
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
  getPlayerSeasonStatsBatch(playerIds: string[]) {
    return this.prisma.playerGameStat.findMany({
      where: { playerId: { in: playerIds } },
      include: { game: true },
      orderBy: { game: { gameDate: "desc" } },
    });
  }
}
