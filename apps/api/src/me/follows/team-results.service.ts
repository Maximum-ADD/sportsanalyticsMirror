import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import {
  chooseOrientationTeamId,
  orientGameToTeam,
  type GameForOrientation,
  type OrientedGameResult,
} from "./game-orientation.js";

/**
 * Reads the "your teams" results feed: the most recent completed games
 * involving the teams this user follows, each rewritten from their team's
 * point of view rather than the home team's.
 *
 * Read-only. Every game, score and prediction here already exists in the
 * database; this service selects and reframes, it does not compute basketball.
 */

// How many results the feed returns. The home page shows a short "since you
// were last here" strip, not a season archive - and the cap keeps the query
// bounded no matter how many teams the user follows.
const RECENT_RESULTS_COUNT = 10;

/**
 * The feed envelope. Deliberately not the { data, page, pageSize, total }
 * pagination envelope: this is a fixed-size recent-activity strip with no page
 * parameter, and reporting a page/total for something the caller cannot page
 * through would be misleading. Callers wanting the full history use /v1/games.
 */
export interface TeamResultsFeed {
  data: OrientedGameResult[];
}

const EMPTY_FEED: TeamResultsFeed = { data: [] };

@Injectable()
export class TeamResultsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recent completed games for the user's followed teams, oriented to them.
   *
   * @param userId - the signed-in user, from the session.
   * @returns up to RECENT_RESULTS_COUNT results, most recent game first. Empty
   *          when the user follows no teams, or when none of their teams has a
   *          completed game yet.
   * @remarks Two queries total: the user's team follows, then one page of
   *          games. "Completed" means both final scores are present - a
   *          scheduled or in-progress game has null scores and is excluded at
   *          the database, so the feed never shows a game as won or lost
   *          before it has been played.
   */
  async getFollowedTeamResults(userId: string): Promise<TeamResultsFeed> {
    const teamFollows = await this.prisma.followedTeam.findMany({
      where: { userId },
      select: { teamId: true, isPrimary: true },
    });
    if (teamFollows.length === 0) return EMPTY_FEED;

    const followedTeamIds = new Set(teamFollows.map((teamFollow) => teamFollow.teamId));
    const primaryTeamId = teamFollows.find((teamFollow) => teamFollow.isPrimary)?.teamId ?? null;

    const games = await this.prisma.game.findMany({
      where: {
        homeScore: { not: null },
        awayScore: { not: null },
        OR: [
          { homeTeamId: { in: [...followedTeamIds] } },
          { awayTeamId: { in: [...followedTeamIds] } },
        ],
      },
      include: { homeTeam: true, awayTeam: true, prediction: true },
      orderBy: { gameDate: "desc" },
      take: RECENT_RESULTS_COUNT,
    });

    const data = games
      .map((game) => orientOneGame(game, followedTeamIds, primaryTeamId))
      .filter((result): result is OrientedGameResult => result !== null);

    return { data };
  }
}

/**
 * Chooses whose side to tell one game from, then tells it.
 *
 * @param game - a completed game with both teams and its prediction included.
 * @param followedTeamIds - the teams this user follows.
 * @param primaryTeamId - the user's primary team, or null.
 * @returns the oriented result, or null if the game cannot be oriented (no
 *          followed team in it, or no final score) - filtered out by the
 *          caller.
 */
function orientOneGame(
  game: GameForOrientation,
  followedTeamIds: ReadonlySet<string>,
  primaryTeamId: string | null
): OrientedGameResult | null {
  const yourTeamId = chooseOrientationTeamId(followedTeamIds, primaryTeamId, game);
  if (!yourTeamId) return null;
  return orientGameToTeam(game, yourTeamId);
}
