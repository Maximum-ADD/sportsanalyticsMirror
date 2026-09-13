import { Injectable } from "@nestjs/common";
import type { Player, Prisma, Team } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type PlayerWithTeam = Player & { team: Team | null };

// Every field except id and nbaPlayerId — those two are the identity
// ingestion upserts against (see apps/ingestion/rosters.py), so letting an
// edit here change them would desync the next ingestion run from the row
// it's meant to update.
export interface UpdatePlayerDto {
  firstName?: string;
  lastName?: string;
  position?: string;
  heightInches?: number | null;
  weightLbs?: number | null;
  jerseyNumber?: string | null;
  headshotUrl?: string | null;
  teamId?: string | null;
  birthDate?: Date | null;
  school?: string | null;
  country?: string | null;
  lastAffiliation?: string | null;
  seasonExp?: number | null;
  rosterStatus?: string | null;
  draftYear?: number | null;
  draftRound?: number | null;
  draftNumber?: number | null;
}

function getSearchTerms(search: unknown): string[] {
  return typeof search === "string" ? search.trim().split(/\s+/).filter(Boolean) : [];
}

@Injectable()
export class AdminPlayersService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlayers(query: Record<string, unknown>): Promise<PagedResult<PlayerWithTeam>> {
    const { page, pageSize } = parsePageParams(query);
    const searchTerms = getSearchTerms(query.search);
    const teamId = typeof query.teamId === "string" ? query.teamId : undefined;
    const where: Prisma.PlayerWhereInput = {
      ...(teamId ? { teamId } : {}),
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

  updatePlayer(playerId: string, patch: UpdatePlayerDto): Promise<PlayerWithTeam> {
    return this.prisma.player.update({ where: { id: playerId }, data: patch, include: { team: true } });
  }
}
