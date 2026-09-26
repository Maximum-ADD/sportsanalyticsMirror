import { HttpStatus, Injectable } from "@nestjs/common";
import type { ProspectGame, ProspectSeason, ProspectValuation } from "@prisma/client";
import { ApiException } from "../common/api-exception.js";
import { PUBLISHED_GAME_FILTER } from "../common/game-visibility.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { PlayerWithTeam } from "../players/players.service.js";
import { deriveSeasonAverages, type DerivedSeasonAverages } from "../players/season-averages.js";
import { adjustForLevel } from "./level-adjustment.js";
import { toDerivableGame } from "./prospect-games.js";
import { ProspectValuationService } from "./prospect-valuation.service.js";
import { rookieSeasonLabel } from "./rookie-season.js";
import { MINIMUM_GAMES_REQUIRED, describeValuationState } from "./valuation-state.js";

type SeasonWithGames = ProspectSeason & { games: ProspectGame[]; valuations: ProspectValuation[] };

/**
 * Reads for Become Pro. Every one is the signed-in user's OWN data.
 *
 * There is deliberately no public read and no read of another user's seasons:
 * Become Pro compares a user with real NBA players, never with each other,
 * and that privacy is why nothing a user enters needs verifying — it only ever
 * reaches them. Writes live in MeBecomeProService, following the rest of this
 * API's read/write split.
 *
 * Nothing here is cached. The data is per-user, changes on every game the
 * owner logs, and is only ever read by that one person.
 */
@Injectable()
export class BecomeProService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly valuationService: ProspectValuationService
  ) {}

  /**
   * The signed-in user's Become Pro page: every season, and one of them in
   * full — its derived line, games, valuation and NBA comparables.
   *
   * @param seasonId - which season to show; defaults to the most recent league
   *                   year.
   * @returns an empty page (no seasons, null figures) for somebody who has not
   *          started — a normal state for your own page, not an error.
   * @throws ApiException 404 when `seasonId` is not one of the caller's seasons.
   */
  async getMyProfile(userId: string, seasonId?: string) {
    let seasons = await this.loadSeasons(userId);
    const active = this.pickActive(seasons, seasonId);

    if (!active) {
      return {
        seasons: [],
        activeSeasonId: null,
        seasonAverages: null,
        gameLog: [],
        games: [],
        valuationState: null,
        valuation: null,
        valueHistory: [],
        minimumGamesRequired: MINIMUM_GAMES_REQUIRED,
      };
    }

    // A model trained since this season was last valued takes effect now, on
    // the owner's next visit — then the season is re-read so the page shows
    // the fresh figure rather than the one it just replaced.
    await this.valuationService.refreshIfStale(active.id, active.valuations[0]?.modelId);
    seasons = await this.loadSeasons(userId);
    const fresh = seasons.find((season) => season.id === active.id) as SeasonWithGames;

    const averages = deriveSeasonAverages(fresh.games.map(toDerivableGame));
    const latest = fresh.valuations[0] ?? null;
    const hasValue = latest?.projectedValueUsd != null;

    return {
      seasons: seasons.map(serializeSeason),
      activeSeasonId: fresh.id,
      seasonAverages: averages,
      gameLog: fresh.games.map((game) => ({
        gameId: game.id,
        gameDate: game.gameDate,
        points: game.points,
        season: fresh.season,
      })),
      games: fresh.games.map(serializeGame),
      valuationState: describeValuationState({ gamesLogged: fresh.games.length, hasValue }),
      valuation: hasValue && latest ? await this.serializeValuation(latest, averages) : null,
      valueHistory: await this.valueHistory(fresh.id),
      minimumGamesRequired: MINIMUM_GAMES_REQUIRED,
    };
  }

  /**
   * The signed-in user's current standing, small enough for the Home rail and
   * the profile page — a figure and a trend, not the whole breakdown.
   */
  async getMySummary(userId: string) {
    const seasons = await this.loadSeasons(userId);
    const current = seasons[0];

    if (!current) {
      return {
        season: null,
        competitionLevel: null,
        gamesLogged: 0,
        valuationState: null,
        projectedDraftSlot: null,
        projectedValueUsd: null,
        valueHistory: [],
        minimumGamesRequired: MINIMUM_GAMES_REQUIRED,
      };
    }

    await this.valuationService.refreshIfStale(current.id, current.valuations[0]?.modelId);
    const latest = await this.prisma.prospectValuation.findFirst({
      where: { seasonId: current.id },
      orderBy: { computedAt: "desc" },
    });
    const hasValue = latest?.projectedValueUsd != null;

    return {
      season: current.season,
      competitionLevel: current.competitionLevel,
      gamesLogged: current.games.length,
      valuationState: describeValuationState({ gamesLogged: current.games.length, hasValue }),
      projectedDraftSlot: hasValue ? (latest?.projectedDraftSlot ?? null) : null,
      projectedValueUsd: hasValue ? (latest?.projectedValueUsd ?? null) : null,
      valueHistory: await this.valueHistory(current.id),
      minimumGamesRequired: MINIMUM_GAMES_REQUIRED,
    };
  }

  // ── internals ───────────────────────────────────────────────────────────

  // Most recent league year first, which is the season a page opens on.
  private loadSeasons(userId: string): Promise<SeasonWithGames[]> {
    return this.prisma.prospectSeason.findMany({
      where: { userId },
      orderBy: { season: "desc" },
      include: {
        games: { orderBy: { gameDate: "asc" } },
        valuations: { orderBy: { computedAt: "desc" }, take: 1 },
      },
    });
  }

  private pickActive(seasons: SeasonWithGames[], seasonId: string | undefined): SeasonWithGames | null {
    if (!seasonId) return seasons[0] ?? null;
    const match = seasons.find((season) => season.id === seasonId);
    if (!match) {
      // 404 rather than 403: a season id that belongs to somebody else must be
      // indistinguishable from one that does not exist.
      throw new ApiException(HttpStatus.NOT_FOUND, "SEASON_NOT_FOUND", "No such season");
    }
    return match;
  }

  // Oldest first — the page plots this as a sparkline, and a trend has to read
  // left to right in time. Only valued runs are points on it.
  private async valueHistory(seasonId: string) {
    const rows = await this.prisma.prospectValuation.findMany({
      where: { seasonId, projectedValueUsd: { not: null } },
      orderBy: { computedAt: "asc" },
      select: { computedAt: true, projectedValueUsd: true },
    });
    // A row is written whenever ANY part of the valuation moves — the drivers
    // quote the season line, so nearly every logged game changes them — which
    // leaves runs of rows carrying the same value. This is a line of the VALUE,
    // so each run is one point (when the value was first reached) rather than
    // a flat stretch of repeats that would read as movement on the sparkline.
    const points: { computedAt: Date; valueUsd: number }[] = [];
    for (const row of rows) {
      if (points.at(-1)?.valueUsd === row.projectedValueUsd) continue;
      points.push({ computedAt: row.computedAt, valueUsd: row.projectedValueUsd as number });
    }
    return points;
  }

  private async serializeValuation(row: ProspectValuation, averages: DerivedSeasonAverages) {
    const [comparables, slotAlumni] = await Promise.all([
      this.resolveComparables(row),
      this.resolvePlayers(row.slotAlumniPlayerIds),
    ]);

    return {
      seasonId: row.seasonId,
      projectedDraftSlot: row.projectedDraftSlot,
      projectedValueUsd: row.projectedValueUsd,
      projectedValueLowUsd: row.projectedValueLowUsd,
      projectedValueHighUsd: row.projectedValueHighUsd,
      rookieScaleYear: row.rookieScaleYear,
      levelFactor: row.levelFactor,
      levelFactorBasis: row.levelFactorBasis,
      modelVersion: row.modelVersion,
      computedAt: row.computedAt,
      drivers: row.drivers,
      // The line the similarity score was actually computed on, so the
      // comparison radar can plot like against like. Computed here rather than
      // in the browser: the client never applies the level factor itself.
      levelAdjustedAverages: adjustForLevel(averages, row.levelFactor),
      comparables,
      // Filtered rather than defaulted: the model only picks players with a
      // draft year, but a later bio re-ingestion could null one, and "drafted
      // in 0" is a figure nobody measured.
      slotAlumni: slotAlumni
        .filter((player) => player.draftYear !== null)
        .map((player) => ({ player, draftYear: player.draftYear as number })),
    };
  }

  private async resolveComparables(row: ProspectValuation) {
    const players = await this.resolvePlayers(row.comparablePlayerIds);
    const scoreById = new Map(row.comparablePlayerIds.map((id, index) => [id, row.comparableScores[index]]));

    const resolved = await Promise.all(
      players.map(async (player) => {
        // The line the model actually compared against: the player's ROOKIE
        // REGULAR SEASON, derived from their draft year. Not their career, not
        // with the postseason mixed in, and not "the earliest season on
        // record" — this database holds only a few recent seasons, so for a
        // veteran that would be a prime year mislabelled as a rookie one.
        if (player.draftYear === null) return null;
        const rookieSeason = rookieSeasonLabel(player.draftYear);

        // PUBLISHED_GAME_FILTER for the same reason every other public
        // PlayerGameStat read carries it: a game whose ingestion batch has not
        // cleared review must not reach a page through this door.
        const rows = await this.prisma.playerGameStat.findMany({
          where: {
            playerId: player.id,
            game: { season: rookieSeason, seasonType: "REGULAR", ...PUBLISHED_GAME_FILTER },
          },
        });
        if (rows.length === 0) return null;

        return {
          player,
          rookieSeason,
          seasonAverages: deriveSeasonAverages(rows),
          similarity: scoreById.get(player.id) ?? 0,
        };
      })
    );

    // A comparable whose games have all been unpublished since the valuation
    // was made has no line left to show. Dropping it beats plotting a zeroed
    // shape at the origin, which would read as a real, absurd rookie season.
    return resolved.filter((comparable) => comparable !== null);
  }

  // Preserves the order the model gave them in — descending similarity, or
  // most recent draft first for slot alumni — which findMany does not.
  private async resolvePlayers(playerIds: string[]): Promise<PlayerWithTeam[]> {
    if (playerIds.length === 0) return [];
    const players = await this.prisma.player.findMany({
      where: { id: { in: playerIds } },
      include: { team: true },
    });
    const byId = new Map(players.map((player) => [player.id, player]));
    return playerIds.map((id) => byId.get(id)).filter((player): player is PlayerWithTeam => player !== undefined);
  }
}

function serializeSeason(season: SeasonWithGames) {
  return {
    id: season.id,
    season: season.season,
    competitionLevel: season.competitionLevel,
    position: season.position,
    teamName: season.teamName,
    gamesLogged: season.games.length,
    createdAt: season.createdAt,
    updatedAt: season.updatedAt,
  };
}

function serializeGame(game: ProspectGame) {
  return {
    id: game.id,
    seasonId: game.seasonId,
    gameDate: game.gameDate,
    opponent: game.opponent,
    minutes: game.minutes,
    points: game.points,
    rebounds: game.rebounds,
    assists: game.assists,
    steals: game.steals,
    blocks: game.blocks,
    turnovers: game.turnovers,
    fieldGoalsMade: game.fieldGoalsMade,
    fieldGoalsAttempted: game.fieldGoalsAttempted,
    threesMade: game.threesMade,
    threesAttempted: game.threesAttempted,
    freeThrowsMade: game.freeThrowsMade,
    freeThrowsAttempted: game.freeThrowsAttempted,
  };
}
