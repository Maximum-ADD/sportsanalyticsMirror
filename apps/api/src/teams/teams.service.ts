import { Injectable } from "@nestjs/common";
import type { Prisma, Team } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";

function getSearchTerms(search: unknown): string[] {
  return typeof search === "string" ? search.trim().split(/\s+/).filter(Boolean) : [];
}

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTeams(query: Record<string, unknown>): Promise<PagedResult<Team>> {
    const { page, pageSize } = parsePageParams(query);
    const searchTerms = getSearchTerms(query.search);
    const where: Prisma.TeamWhereInput = {
      AND: searchTerms.map((searchTerm) => ({
        OR: [
          { city: { contains: searchTerm, mode: "insensitive" } },
          { name: { contains: searchTerm, mode: "insensitive" } },
          { abbreviation: { contains: searchTerm, mode: "insensitive" } },
        ],
      })),
    };

    const [data, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: "asc" },
      }),
      this.prisma.team.count({ where }),
    ]);

    return { data, page, pageSize, total };
  }

  getTeamById(teamId: string): Promise<Team | null> {
    return this.prisma.team.findUnique({ where: { id: teamId } });
  }
}
