import { Injectable } from "@nestjs/common";
import type { Player, Team } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type PlayerWithTeam = Player & { team: Team | null };

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  // Paginated player list, optionally narrowed by an exact teamId and/or
  // position match. query is the raw request query string object; only the
  // recognised keys (page, pageSize, teamId, position) have any effect.
  async getPlayers(query: Record<string, unknown>): Promise<PagedResult<PlayerWithTeam>> {
    const { page, pageSize } = parsePageParams(query);
    const teamId = typeof query.teamId === "string" ? query.teamId : undefined;
    const position = typeof query.position === "string" ? query.position : undefined;

    const where = {
      ...(teamId ? { teamId } : {}),
      ...(position ? { position } : {}),
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
}
