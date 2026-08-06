import { prisma } from "../lib/prisma.js";
import { parsePageParams, type PagedResult } from "../types/pagination.js";
import type { Team } from "@prisma/client";

export async function getTeams(query: Record<string, unknown>): Promise<PagedResult<Team>> {
  const { page, pageSize } = parsePageParams(query);

  const [data, total] = await Promise.all([
    prisma.team.findMany({ skip: (page - 1) * pageSize, take: pageSize, orderBy: { name: "asc" } }),
    prisma.team.count(),
  ]);

  return { data, page, pageSize, total };
}

export function getTeamById(teamId: string): Promise<Team | null> {
  return prisma.team.findUnique({ where: { id: teamId } });
}
