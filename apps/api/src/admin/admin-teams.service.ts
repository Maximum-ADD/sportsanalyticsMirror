import { Injectable } from "@nestjs/common";
import type { Prisma, Team } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";

// Every field except id and nbaTeamId — those two are the identity ingestion
// upserts against (see apps/ingestion), so letting an edit here change them
// would desync the next ingestion run from the row it's meant to update.
export interface UpdateTeamDto {
  name?: string;
  abbreviation?: string;
  city?: string;
  conference?: string;
  division?: string;
  logoUrl?: string | null;
}

function getSearchTerms(search: unknown): string[] {
  return typeof search === "string" ? search.trim().split(/\s+/).filter(Boolean) : [];
}

@Injectable()
export class AdminTeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTeams(query: Record<string, unknown>): Promise<PagedResult<Team>> {
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
      this.prisma.team.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { name: "asc" } }),
      this.prisma.team.count({ where }),
    ]);

    return { data, page, pageSize, total };
  }

  getTeamById(teamId: string): Promise<Team | null> {
    return this.prisma.team.findUnique({ where: { id: teamId } });
  }

  updateTeam(teamId: string, patch: UpdateTeamDto): Promise<Team> {
    return this.prisma.team.update({ where: { id: teamId }, data: patch });
  }
}
