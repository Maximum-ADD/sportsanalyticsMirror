import { Injectable } from "@nestjs/common";
import type { Game, GamePrediction, Prisma, Team } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { parseSeasonType } from "../common/season-type.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type GameWithTeams = Game & { homeTeam: Team; awayTeam: Team };
export type GameWithTeamsAndPrediction = GameWithTeams & { prediction: GamePrediction | null };

@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  // Most recent games first — this is what a "recent results" widget wants,
  // and there's no requirement yet for chronological (oldest-first) order.
  // `prediction` is included in the same query (a single join, via the
  // Game.prediction relation) rather than left for callers to fetch
  // per-game — the Predictions page used to do exactly that (one request
  // per game, N+1) and it was fast enough against local mock data but
  // became genuinely slow once there were hundreds of real games behind a
  // network-hop database instead of localhost.
  //
  // An absent `seasonType` means no filter — every segment, mixed. That's
  // deliberately different from the player-stats endpoints, which default
  // to REGULAR: a schedule/results list is the one view where seeing a
  // team's regular season and playoff run in one chronological sequence is
  // the useful thing rather than a bleed, and nothing derived is being
  // averaged across segments here. The frontend still always sends a
  // segment when the user has picked one.
  async getGames(query: Record<string, unknown>): Promise<PagedResult<GameWithTeamsAndPrediction>> {
    const { page, pageSize } = parsePageParams(query);
    const seasonType = parseSeasonType(query.seasonType);

    const where: Prisma.GameWhereInput = seasonType ? { seasonType } : {};

    const [data, total] = await Promise.all([
      this.prisma.game.findMany({
        where,
        include: { homeTeam: true, awayTeam: true, prediction: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { gameDate: "desc" },
      }),
      this.prisma.game.count({ where }),
    ]);

    return { data, page, pageSize, total };
  }

  getGameById(gameId: string): Promise<GameWithTeamsAndPrediction | null> {
    return this.prisma.game.findUnique({
      where: { id: gameId },
      include: { homeTeam: true, awayTeam: true, prediction: true },
    });
  }
}
