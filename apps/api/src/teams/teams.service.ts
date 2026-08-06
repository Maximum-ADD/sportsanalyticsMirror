import { Injectable } from "@nestjs/common";
import type { Team } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTeams(query: Record<string, unknown>): Promise<PagedResult<Team>> {
    const { page, pageSize } = parsePageParams(query);

    const [data, total] = await Promise.all([
      this.prisma.team.findMany({ skip: (page - 1) * pageSize, take: pageSize, orderBy: { name: "asc" } }),
      this.prisma.team.count(),
    ]);

    return { data, page, pageSize, total };
  }

  getTeamById(teamId: string): Promise<Team | null> {
    return this.prisma.team.findUnique({ where: { id: teamId } });
  }
}
