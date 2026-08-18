import { Injectable } from "@nestjs/common";
import type { Game, Team } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type GameWithTeams = Game & { homeTeam: Team; awayTeam: Team };

@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  // Most recent games first — this is what a "recent results" widget wants,
  // and there's no requirement yet for chronological (oldest-first) order.
  async getGames(query: Record<string, unknown>): Promise<PagedResult<GameWithTeams>> {
    const { page, pageSize } = parsePageParams(query);

    const [data, total] = await Promise.all([
      this.prisma.game.findMany({
        include: { homeTeam: true, awayTeam: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { gameDate: "desc" },
      }),
      this.prisma.game.count(),
    ]);

    return { data, page, pageSize, total };
  }

  getGameById(gameId: string): Promise<GameWithTeams | null> {
    return this.prisma.game.findUnique({
      where: { id: gameId },
      include: { homeTeam: true, awayTeam: true },
    });
  }
}
