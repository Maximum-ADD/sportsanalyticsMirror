import { Injectable } from "@nestjs/common";
import type { Game, GamePrediction, Prisma, SeasonType, Team } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { parseSeasonType } from "../common/season-type.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type GameWithTeams = Game & { homeTeam: Team; awayTeam: Team };
export type GameWithTeamsAndPrediction = GameWithTeams & { prediction: GamePrediction | null };

const INCLUDE_TEAMS_AND_PREDICTION = { homeTeam: true, awayTeam: true, prediction: true } as const;

type GameStatusFilter = "all" | "upcoming" | "completed";

function parseStatusFilter(query: Record<string, unknown>): GameStatusFilter {
  return query.status === "upcoming" || query.status === "completed" ? query.status : "all";
}

// Exact match against Game.season (e.g. "2025-26") — not validated against
// a known-seasons list here, so an unrecognized value just yields an empty
// page rather than a 400; callers (season filter dropdowns) are expected to
// source their options from real data (see GamesService.getSeasons) rather
// than free text.
function parseSeasonFilter(query: Record<string, unknown>): string | undefined {
  return typeof query.season === "string" && query.season.length > 0 ? query.season : undefined;
}

@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  // Soonest-upcoming-first, then most-recently-completed — NOT a plain
  // gameDate desc/asc. A single "most recent first" order made sense back
  // when every row in Game was already played (gameDate desc put the
  // latest result first, which is what a "recent results" list wants), but
  // it silently broke the instant this project's Game table gained real
  // upcoming rows (see apps/ingestion/schedule.py): with a full season of
  // future games loaded, gameDate desc puts the LAST game of the season
  // months from now at the top instead of anything happening soon.
  // "Upcoming" here means homeScore is still null — see isCompleted's twin
  // in the web app (PredictionsPage.tsx) for the same definition used
  // client-side.
  //
  // ?status=upcoming|completed narrows to one group outright (a single,
  // simply-ordered query — no merge needed). ?status=all (the default)
  // needs both groups in one page: Prisma's orderBy can't express "ascending
  // within one group, descending within another" on the same column in a
  // single query, so this runs two queries (one per group, each already
  // correctly ordered) and merges in application code — upcoming games
  // first, completed games after. Each query takes page*pageSize rows so
  // any requested page is covered regardless of where the upcoming/
  // completed boundary falls within it; for this project's actual data
  // volumes (thousands of games, page sizes capped at 100) that's a
  // trivially cheap over-fetch, not a real cost.
  //
  // ?season=2025-26 narrows either path to one season — added once this
  // project's Game table held more than one season's worth of rows (see
  // ingest_historical_season.py / ingest_schedule.py) and a caller (the
  // Predictions page's season filter) needed to ask for a specific one by
  // name rather than only ever seeing "soonest upcoming, then most recent."
  //
  // An absent `seasonType` means no filter — every segment, mixed. That's
  // deliberately different from the player-stats endpoints, which default
  // to REGULAR: a schedule/results list is the one view where seeing a
  // team's regular season and playoff run in one chronological sequence is
  // the useful thing rather than a bleed, and nothing derived is being
  // averaged across segments here. The frontend still always sends a
  // segment when the user has picked one.
  //
  // Every orderBy carries `id: "asc"` as a second key — NOT decorative.
  // Many games share the exact same gameDate (every game on a given real
  // calendar day stores the same timestamp; confirmed live, e.g. 12 games
  // tied on one date), so gameDate alone isn't a unique sort key. Without a
  // tiebreaker, Postgres is free to return those tied rows in a different
  // order on each call, which surfaced as a real bug: a "soonest 6 upcoming
  // games" page (see PlayerCards.tsx's useUpcomingPlayerReliability) could
  // silently reshuffle which games/players it showed between page loads
  // with no data having actually changed.
  async getGames(query: Record<string, unknown>): Promise<PagedResult<GameWithTeamsAndPrediction>> {
    const { page, pageSize } = parsePageParams(query);
    const status = parseStatusFilter(query);
    const season = parseSeasonFilter(query);
    const seasonType = parseSeasonType(query.seasonType);
    const rowsNeeded = page * pageSize;

    const seasonWhere: Prisma.GameWhereInput = {
      ...(season ? { season } : {}),
      ...(seasonType ? { seasonType } : {}),
    };

    if (status === "upcoming") {
      const [data, total] = await Promise.all([
        this.prisma.game.findMany({
          where: { ...seasonWhere, homeScore: null },
          include: INCLUDE_TEAMS_AND_PREDICTION,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ gameDate: "asc" }, { id: "asc" }],
        }),
        this.prisma.game.count({ where: { ...seasonWhere, homeScore: null } }),
      ]);
      return { data, page, pageSize, total };
    }

    if (status === "completed") {
      const [data, total] = await Promise.all([
        this.prisma.game.findMany({
          where: { ...seasonWhere, homeScore: { not: null } },
          include: INCLUDE_TEAMS_AND_PREDICTION,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ gameDate: "desc" }, { id: "asc" }],
        }),
        this.prisma.game.count({ where: { ...seasonWhere, homeScore: { not: null } } }),
      ]);
      return { data, page, pageSize, total };
    }

    const [upcoming, completed, total] = await Promise.all([
      this.prisma.game.findMany({
        where: { ...seasonWhere, homeScore: null },
        include: INCLUDE_TEAMS_AND_PREDICTION,
        take: rowsNeeded,
        orderBy: [{ gameDate: "asc" }, { id: "asc" }],
      }),
      this.prisma.game.findMany({
        where: { ...seasonWhere, homeScore: { not: null } },
        include: INCLUDE_TEAMS_AND_PREDICTION,
        take: rowsNeeded,
        orderBy: [{ gameDate: "desc" }, { id: "asc" }],
      }),
      this.prisma.game.count({ where: seasonWhere }),
    ]);

    const merged = [...upcoming, ...completed];
    const data = merged.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    return { data, page, pageSize, total };
  }

  getGameById(gameId: string): Promise<GameWithTeamsAndPrediction | null> {
    return this.prisma.game.findUnique({
      where: { id: gameId },
      include: INCLUDE_TEAMS_AND_PREDICTION,
    });
  }

  // Distinct seasons present in Game, most recent first — backs a season
  // filter dropdown with real options instead of a hardcoded/guessed list,
  // so it never offers a season with zero games or misses one that was
  // just ingested (see ingest_historical_season.py / ingest_schedule.py).
  // String-sorted, not date-sorted: this project's season strings
  // ("2023-24", "2024-25", ...) already sort correctly as plain strings,
  // and there's no reliable "season start date" column to sort by instead.
  async getSeasons(): Promise<string[]> {
    const rows = await this.prisma.game.findMany({
      distinct: ["season"],
      select: { season: true },
      orderBy: { season: "desc" },
    });
    return rows.map((row) => row.season);
  }

  // Every still-unplayed game one team is involved in, soonest first — the
  // schedule a matchup projection charts (see StatsService.getMatchup
  // Projection). "Unplayed" reads as homeScore null (the same sentinel the
  // upcoming/completed split above uses), and the gameDate floor keeps
  // finished games out even if a boxscore backfill left the score columns
  // momentarily inconsistent. No season filter: during a season, "the
  // upcoming schedule" is simply whatever hasn't been played yet.
  getUpcomingGamesForTeam(teamId: string, seasonType: SeasonType) {
    return this.prisma.game.findMany({
      where: {
        homeScore: null,
        seasonType,
        gameDate: { gte: new Date() },
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: [{ gameDate: "asc" }, { id: "asc" }],
    });
  }
}
