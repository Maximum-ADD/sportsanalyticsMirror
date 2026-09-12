import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import {
  chooseOrientationTeamId,
  orientGameToTeam,
  type GameForOrientation,
  type OrientedGameResult,
} from "./game-orientation.js";

/**
 * Reads the "your team" results feed: the most recent completed games
 * involving the team this user supports, each rewritten from their team's
 * point of view rather than the home team's.
 *
 * The team comes from User.favoriteTeamId, which onboarding sets and
 * PATCH /v1/me changes - there is no separate followed-teams table. An
 * earlier version of this feed had one, supporting many followed teams with
 * one marked primary; it was dropped because onboarding wrote favoriteTeamId
 * and this feed read the other table, so the strip was empty for every user
 * who had actually chosen a team.
 *
 * Read-only. Every game, score and prediction here already exists in the
 * database; this service selects and reframes, it does not compute basketball.
 */

// How many results the feed returns. The home page shows a short "since you
// were last here" strip, not a season archive.
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
   * Recent completed games for the user's favourite team, oriented to them.
   *
   * @param userId - the signed-in user, from the session.
   * @returns up to RECENT_RESULTS_COUNT results, most recent game first. Empty
   *          when the user has not chosen a team, or when that team has no
   *          completed game yet.
   * @remarks Two queries total: the user's chosen team, then one page of
   *          games. "Completed" means both final scores are present - a
   *          scheduled or in-progress game has null scores and is excluded at
   *          the database, so the feed never shows a game as won or lost
   *          before it has been played.
   */
  async getFollowedTeamResults(userId: string): Promise<TeamResultsFeed> {
    // Only this one column is selected. The user row also carries an email
    // and an avatar path, and a feed of basketball results has no business
    // reading either.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { favoriteTeamId: true },
    });
    const favoriteTeamId = user?.favoriteTeamId;
    if (!favoriteTeamId) return EMPTY_FEED;

    const games = await this.prisma.game.findMany({
      where: {
        homeScore: { not: null },
        awayScore: { not: null },
        OR: [{ homeTeamId: favoriteTeamId }, { awayTeamId: favoriteTeamId }],
      },
      include: { homeTeam: true, awayTeam: true, prediction: true },
      orderBy: { gameDate: "desc" },
      take: RECENT_RESULTS_COUNT,
    });

    // One team, so it is both the only followed team and the primary one.
    // chooseOrientationTeamId still does the work rather than being inlined:
    // it is what decides which side to tell a game from when the chosen team
    // appears on either side of it, and it is covered by its own spec.
    const data = games
      .map((game) => orientOneGame(game, new Set([favoriteTeamId]), favoriteTeamId))
      .filter((result): result is OrientedGameResult => result !== null);

    return { data };
  }
}

/**
 * Chooses whose side to tell one game from, then tells it.
 *
 * @param game - a completed game with both teams and its prediction included.
 * @param followedTeamIds - the user's team, as a one-element set.
 * @param primaryTeamId - the same team.
 * @returns the oriented result, or null if the game cannot be oriented (the
 *          user's team is not in it, or there is no final score) - filtered
 *          out by the caller.
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
