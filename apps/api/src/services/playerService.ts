import { prisma } from "../lib/prisma.js";
import { parsePageParams, type PagedResult } from "../types/pagination.js";
import type { Player, Team } from "@prisma/client";

export type PlayerWithTeam = Player & { team: Team | null };

export async function getPlayers(query: Record<string, unknown>): Promise<PagedResult<PlayerWithTeam>> {
  const { page, pageSize } = parsePageParams(query);
  const teamId = typeof query.teamId === "string" ? query.teamId : undefined;
  const position = typeof query.position === "string" ? query.position : undefined;

  const where = {
    ...(teamId ? { teamId } : {}),
    ...(position ? { position } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.player.findMany({
      where,
      include: { team: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { lastName: "asc" },
    }),
    prisma.player.count({ where }),
  ]);

  return { data, page, pageSize, total };
}

export function getPlayerById(playerId: string): Promise<PlayerWithTeam | null> {
  return prisma.player.findUnique({ where: { id: playerId }, include: { team: true } });
}

export function getPlayerSeasonStats(playerId: string) {
  return prisma.playerGameStat.findMany({
    where: { playerId },
    include: { game: true },
    orderBy: { game: { gameDate: "desc" } },
  });
}
