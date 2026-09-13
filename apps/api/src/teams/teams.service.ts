import { Injectable } from "@nestjs/common";
import type { Prisma, Team } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PlayersService, type PlayerWithTeam } from "../players/players.service.js";
import { StatsService } from "../players/stats.service.js";

function getSearchTerms(search: unknown): string[] {
  return typeof search === "string" ? search.trim().split(/\s+/).filter(Boolean) : [];
}

function roundToDecimalPlaces(value: number, decimalPlaces: number): number {
  const scalingFactor = 10 ** decimalPlaces;
  return Math.round(value * scalingFactor) / scalingFactor;
}

export interface TeamEloRating {
  team: Team;
  elo: number;
  // The game this rating was read from — a completed game's rating is
  // frozen at kickoff (see GamePrediction.homeTeamEloPre's own doc
  // comment); an upcoming game's is the team's TRUE current rating, since
  // predict_games.py's predict_upcoming_games starts every upcoming
  // prediction from final_ratings (the real end-of-history Elo, computed
  // fresh on every run) — see apps/predictor/elo.py.
  asOfGameId: string;
  asOfGameDate: Date;
}

// One roster player's usage rate, for ranking in getSuggestedPlayers below.
export interface SuggestedPlayer {
  player: PlayerWithTeam;
  usagePercentage: number | null;
}

// A team's win/loss record, derived from completed games only (both scores
// present) — a scheduled or in-progress game has nothing to score yet, so it
// is excluded rather than counted as neither a win nor a loss. Ties are
// impossible in the NBA, so every completed game is exactly one or the other.
export interface TeamRecord {
  teamId: string;
  wins: number;
  losses: number;
  // Rounded to 3 decimal places (e.g. 0.583); null for a team with no
  // completed games yet rather than a misleading 0.
  winPercentage: number | null;
  // Most recent game last, so the array reads left-to-right the same
  // direction the games were played in. Capped at RECENT_FORM_GAME_COUNT.
  recentForm: ("W" | "L")[];
}

// How many of a team's most recent completed games recentForm reports —
// enough to read a hot or cold streak at a glance without turning the teams
// list into a game log.
const RECENT_FORM_GAME_COUNT = 5;

const WIN_PERCENTAGE_DECIMAL_PLACES = 3;

// How many ranked players the onboarding step's "suggested players to
// follow" prompt gets — enough to feel like a real choice without listing
// an entire 15-man roster of names a brand-new user won't recognise.
const DEFAULT_SUGGESTED_PLAYER_COUNT = 8;

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly playersService: PlayersService,
    private readonly statsService: StatsService
  ) {}

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

  // Every team's current Elo rating, most recent first — "current" meaning
  // read from each team's own most recent game WITH a prediction (upcoming
  // if it has one, otherwise its last completed game), not a dedicated
  // per-team column (there isn't one — see TeamEloRating's doc comment for
  // why an upcoming game's snapshot is the real, live number). A team with
  // no predicted game at all (never ingested, or predict_games.py hasn't
  // run yet) is simply absent rather than reported with a fabricated 1500.
  //
  // Two queries (as-home-team candidates, as-away-team candidates), each
  // using Prisma's distinct+orderBy "most recent row per group" pattern
  // (same as OptimizerService.getLatestLineup for PlayerPrediction) since a
  // team's most recent game could be on either side — merged and reduced
  // to one row per team in application code afterward.
  async getEloRatings(): Promise<TeamEloRating[]> {
    const [asHome, asAway] = await Promise.all([
      this.prisma.game.findMany({
        where: { prediction: { isNot: null } },
        include: { homeTeam: true, prediction: true },
        orderBy: { gameDate: "desc" },
        distinct: ["homeTeamId"],
      }),
      this.prisma.game.findMany({
        where: { prediction: { isNot: null } },
        include: { awayTeam: true, prediction: true },
        orderBy: { gameDate: "desc" },
        distinct: ["awayTeamId"],
      }),
    ]);

    const latestByTeamId = new Map<string, TeamEloRating>();
    const consider = (teamId: string, team: Team, elo: number, gameId: string, gameDate: Date) => {
      const existing = latestByTeamId.get(teamId);
      if (!existing || gameDate > existing.asOfGameDate) {
        latestByTeamId.set(teamId, { team, elo, asOfGameId: gameId, asOfGameDate: gameDate });
      }
    };

    for (const game of asHome) {
      consider(game.homeTeamId, game.homeTeam, game.prediction!.homeTeamEloPre, game.id, game.gameDate);
    }
    for (const game of asAway) {
      consider(game.awayTeamId, game.awayTeam, game.prediction!.awayTeamEloPre, game.id, game.gameDate);
    }

    return Array.from(latestByTeamId.values()).sort((a, b) => b.elo - a.elo);
  }

  // Every team's win/loss record and recent form, derived from completed
  // games (both scores present) the same way getEloRatings derives its
  // ratings from Game rows rather than a stored column — nothing here is
  // pre-computed or cached, so a newly ingested result is reflected
  // immediately.
  //
  // One query for every completed game across the league, newest first, then
  // reduced to one record per team in application code — a team can appear
  // as either homeTeamId or awayTeamId, so there is no single WHERE clause
  // that fetches "this team's games" without fetching every team's.
  async getTeamRecords(): Promise<TeamRecord[]> {
    const teams = await this.prisma.team.findMany({ select: { id: true } });
    const games = await this.prisma.game.findMany({
      where: { homeScore: { not: null }, awayScore: { not: null } },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, gameDate: true },
      orderBy: { gameDate: "desc" },
    });

    const gamesByTeamId = new Map<string, { won: boolean }[]>();
    for (const team of teams) {
      gamesByTeamId.set(team.id, []);
    }
    for (const game of games) {
      // homeScore/awayScore are guaranteed non-null by the where clause
      // above; Prisma's generated type can't express that, hence the `!`.
      const homeWon = game.homeScore! > game.awayScore!;
      gamesByTeamId.get(game.homeTeamId)?.push({ won: homeWon });
      gamesByTeamId.get(game.awayTeamId)?.push({ won: !homeWon });
    }

    return teams.map(({ id: teamId }) => {
      const teamGames = gamesByTeamId.get(teamId) ?? [];
      const wins = teamGames.filter((game) => game.won).length;
      const losses = teamGames.length - wins;
      const winPercentage =
        teamGames.length === 0
          ? null
          : roundToDecimalPlaces(wins / teamGames.length, WIN_PERCENTAGE_DECIMAL_PLACES);
      // teamGames is newest-first (games was ordered that way); recentForm
      // reads oldest-to-newest left-to-right, so the slice is reversed.
      const recentForm = teamGames
        .slice(0, RECENT_FORM_GAME_COUNT)
        .reverse()
        .map((game): "W" | "L" => (game.won ? "W" : "L"));

      return { teamId, wins, losses, winPercentage, recentForm };
    });
  }

  // Ranks a team's current roster by usage percentage, highest first — the
  // onboarding step's "suggested players to follow" prompt, so a brand-new
  // user picking their team sees the players who actually run that team's
  // offense rather than an alphabetical bench list. Reuses
  // StatsService.deriveSeasonAverages rather than re-deriving usage rate
  // here, the same "one source of truth for a derived stat" rule every
  // other derived-stat consumer in this app already follows.
  //
  // A player with no PlayerGameStat rows yet (very recent draftee/signing)
  // still appears, with usagePercentage: null, sorted after every player
  // with a real rate — present rather than silently dropped, since
  // "no usage data yet" is itself useful information for who's a safe
  // pick to suggest.
  async getSuggestedPlayers(teamId: string, count = DEFAULT_SUGGESTED_PLAYER_COUNT): Promise<SuggestedPlayer[]> {
    const roster = await this.playersService.getTeamRoster(teamId);
    if (roster.length === 0) return [];

    const statsBatch = await this.statsService.getPlayerStatsBatch(roster.map((player) => player.id));
    const usageByPlayerId = new Map(statsBatch.map((entry) => [entry.playerId, entry.seasonAverages.usagePercentage]));

    return roster
      .map((player) => ({ player, usagePercentage: usageByPlayerId.get(player.id) ?? null }))
      .sort((a, b) => {
        if (a.usagePercentage === null && b.usagePercentage === null) return 0;
        if (a.usagePercentage === null) return 1;
        if (b.usagePercentage === null) return -1;
        return b.usagePercentage - a.usagePercentage;
      })
      .slice(0, count);
  }
}
