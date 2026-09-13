import { Injectable } from "@nestjs/common";
import { SeasonType, type Game, type PlayerGameStat } from "@prisma/client";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { DEFAULT_SEASON_TYPE, parseSeasonType } from "../common/season-type.js";
import { GamesService } from "../games/games.service.js";
import { PlayersService, type PlayerWithTeam } from "./players.service.js";

export interface GameLogEntry {
  gameId: string;
  gameDate: Date;
  points: number;
  // Which league year the game belongs to (e.g. "2025-26") — carried per
  // entry so a trend chart fed by several seasons' games can scope itself
  // to one season instead of plotting them as one unbroken line.
  season: string;
}

// One player's identity-independent stats line — the unit the batch
// endpoint returns, one per requested player id (a player with zero
// PlayerGameStat rows still gets an entry: zeroed averages, empty log —
// same "always present, zeroed rather than omitted" contract
// deriveSeasonAverages already has for a single player, so callers never
// need to special-case a missing map entry vs. a genuinely stat-less player).
export interface PlayerStatsEntry {
  playerId: string;
  seasonAverages: DerivedSeasonAverages;
  gameLog: GameLogEntry[];
}

export interface DerivedSeasonAverages {
  gamesPlayed: number;
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  fieldGoalsMadePerGame: number;
  fieldGoalsAttemptedPerGame: number;
  fieldGoalPercentage: number;
  threesMadePerGame: number;
  threesAttemptedPerGame: number;
  threePointPercentage: number;
  freeThrowsMadePerGame: number;
  freeThrowsAttemptedPerGame: number;
  freeThrowPercentage: number;

  // Derived here rather than stored, like every percentage above. All three
  // were verified against BoxScoreAdvancedV3's own figures during
  // development and matched to three decimal places, so computing them
  // keeps one source of truth instead of two. See apps/ingestion/games.py.
  trueShootingPercentage: number;
  effectiveFieldGoalPercentage: number;

  // Null rather than 0 when the player recorded no turnovers: a ratio with
  // a zero denominator is undefined, and 0.0 would read as the *worst*
  // possible ratio when the player in fact turned the ball over never,
  // which is the best. NBA.com reports 0.0 here; this deliberately doesn't.
  assistToTurnoverRatio: number | null;

  // Null when no game in this segment carries the figure — either the rows
  // predate the columns, or the advanced boxscore was unavailable. Callers
  // render null as "—"; a zero here would be a real measurement (an even
  // plus/minus, a 0% usage rate) rather than a missing one.
  plusMinusPerGame: number | null;
  usagePercentage: number | null;
  offensiveRating: number | null;
  defensiveRating: number | null;
}

// One derived season line per season segment, keyed by SeasonType. Keyed
// off the Prisma enum rather than spelled out as four named fields so a new
// segment in schema.prisma flows through without touching this type.
export type PlayerSeasonSplits = Record<SeasonType, DerivedSeasonAverages>;

// One player's identity plus their derived season line — the unit the
// comparison endpoint returns, one per requested player.
export interface PlayerComparisonEntry {
  player: PlayerWithTeam;
  seasonAverages: DerivedSeasonAverages;
}

// Which season stat a ranked players listing sorts by — the `?sort=` values
// the list endpoint accepts once it leaves the alphabetical default.
export type PlayerStatSortKey = "ppg" | "rpg" | "apg" | "ts";

const STAT_SORT_KEYS: PlayerStatSortKey[] = ["ppg", "rpg", "apg", "ts"];

/**
 * Reads a `sort` query value into a stat sort key.
 *
 * Returns undefined when the parameter is absent or names a stat the
 * endpoint doesn't sort by — the same "unrecognised params are ignored"
 * contract the rest of the list endpoint already has. Callers translate
 * undefined into the alphabetical default.
 */
export function parsePlayerStatSort(rawSort: unknown): PlayerStatSortKey | undefined {
  return STAT_SORT_KEYS.find((sortKey) => sortKey === rawSort);
}

// Which direction a ranked listing orders by. "desc" is the natural reading
// of a leaderboard (most points first); "asc" is the opt-out — fewest
// first, or Z→A under the alphabetical default.
export type SortOrder = "asc" | "desc";

/**
 * Reads an `order` query value into a sort direction.
 *
 * Returns undefined when the parameter is absent or unrecognised, leaving
 * the caller to apply the direction each sort key defaults to (descending
 * for stat rankings, ascending for the alphabetical default).
 */
export function parseSortOrder(rawOrder: unknown): SortOrder | undefined {
  return rawOrder === "asc" || rawOrder === "desc" ? rawOrder : undefined;
}

/**
 * Reads a `minGames` query value into a whole-game participation floor.
 *
 * Returns undefined when the parameter is absent, not a number, or not
 * positive — a floor of zero means "no floor", so filtering nothing
 * explicitly would only clutter the query path.
 */
export function parseMinGames(rawMinGames: unknown): number | undefined {
  const minGames = Number(rawMinGames);
  return Number.isFinite(minGames) && minGames > 0 ? Math.floor(minGames) : undefined;
}

// The participation floor behind GET /v1/players/leaders when the request
// doesn't state one: high enough that a leader's line means something over
// a near-full regular season, without pretending the same floor means
// anything in a 1-20-game postseason segment.
export const DEFAULT_LEADERS_MIN_GAMES = 15;

// The participation floor a postseason segment falls back to when the
// leaders request doesn't state one. Postseason segments run 1-20 games, so
// the regular-season floor would leave a Finals band with no qualified
// leader at all; 4 games is enough for a rate to mean something without
// letting a single hot night lead the category.
export const POSTSEASON_LEADERS_MIN_GAMES = 4;

// The figure each sort key ranks by, derived from season totals with the
// same formulas and rounding as the full season line. Players without
// totals (no games in the segment) rank below every player with some —
// see the NEGATIVE_INFINITY fallback in getPlayersRanked's sort.
const STAT_VALUE_BY_SORT_KEY: Record<PlayerStatSortKey, (totals: SeasonStatTotals) => number> = {
  ppg: (totals) => perGameRate(totals.totalPoints, totals.gamesPlayed),
  rpg: (totals) => perGameRate(totals.totalRebounds, totals.gamesPlayed),
  apg: (totals) => perGameRate(totals.totalAssists, totals.gamesPlayed),
  ts: trueShootingPercentageFromTotals,
};

// One category's season leader — the player with the highest figure in one
// of the headline categories, after the participation floor. `value` is the
// category figure itself (a TS% leader carries a percentage, not a ratio).
export interface SeasonLeader {
  player: PlayerWithTeam;
  value: number;
  gamesPlayed: number;
}

// The four-category leader set behind the players page's "League leaders"
// band. A category with no qualified player is null rather than a zeroed
// entry — "nobody has played enough to lead" is true absence, not a 0.0.
export interface SeasonLeaders {
  ppg: SeasonLeader | null;
  rpg: SeasonLeader | null;
  apg: SeasonLeader | null;
  tsPct: SeasonLeader | null;
}

function averageOf(values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return round(total / values.length);
}

function percentageOf(made: number, attempted: number): number {
  if (attempted === 0) return 0;
  return round((made / attempted) * 100);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

// Ratios get a second decimal place — assist-to-turnover lives in a narrow
// range (roughly 0.5-4.0) where one decimal loses real differences between
// players, unlike the per-game averages above.
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

// Free-throw weighting in the true-shooting possession estimate. 0.44 is the
// standard coefficient from Dean Oliver's work — the same constant
// apps/predictor/four_factors.py uses as FREE_THROW_POSSESSION_WEIGHT — and
// approximates that not every free throw ends a possession (and-ones, the
// first of two).
const FREE_THROW_POSSESSION_WEIGHT = 0.44;

// Points per scoring possession, the "2" in TS% = PTS / (2 * TSA).
const POINTS_PER_SCORING_POSSESSION = 2;

// A 3-pointer counts half again as much as a 2 in effective FG%
// (Oliver's standard formula: eFG% = (FGM + 0.5*3PM) / FGA).
const THREE_POINT_EFG_WEIGHT = 0.5;

// Averages a per-game rate over only the games that actually carry it,
// weighting each game by minutes played.
//
// Minutes-weighted rather than a plain mean because usage rate and the
// offensive/defensive ratings are rates *over playing time*: a 4-minute
// garbage-time appearance with a wild usage rate would otherwise count as
// much as a 38-minute starter's night. Returns null when no game carries
// the figure, or when every game that does had zero minutes — both mean
// "no basis to report", not "zero".
function minutesWeightedAverage(
  gameStats: PlayerGameStat[],
  selectValue: (stat: PlayerGameStat) => number | null
): number | null {
  let weightedSum = 0;
  let totalMinutes = 0;
  let sawAnyValue = false;

  for (const stat of gameStats) {
    const value = selectValue(stat);
    if (value === null) continue;
    sawAnyValue = true;
    weightedSum += value * stat.minutes;
    totalMinutes += stat.minutes;
  }

  if (!sawAnyValue || totalMinutes === 0) return null;
  return round(weightedSum / totalMinutes);
}

// Per-game average over only the games carrying the figure. Used for
// plus/minus, which is a counting stat rather than a rate, so it isn't
// minutes-weighted — it's already expressed per game.
function averageOfPresentValues(
  gameStats: PlayerGameStat[],
  selectValue: (stat: PlayerGameStat) => number | null
): number | null {
  const presentValues = gameStats.map(selectValue).filter((value): value is number => value !== null);
  if (presentValues.length === 0) return null;
  return round(presentValues.reduce((sum, value) => sum + value, 0) / presentValues.length);
}

// The lean per-player aggregation behind the league-wide ranking and
// leaders paths — season totals for exactly the figures those consumers
// rank by. Computed in the database (see PlayersService.getSeasonStatTotals
// Batch) rather than from streamed boxscore rows, which time out against
// the hosted connection pooler at league scale (Prisma P1017). Endpoints
// that need the full ~25-field season line keep deriving it from raw rows;
// they only ever cover one player or a small batch.
export interface SeasonStatTotals {
  playerId: string;
  gamesPlayed: number;
  totalPoints: number;
  totalRebounds: number;
  totalAssists: number;
  totalFieldGoalsAttempted: number;
  totalFreeThrowsAttempted: number;
}

// Per-game rate from season totals — identical arithmetic and rounding to
// deriveSeasonAverages' averageOf over the raw rows, so a ranking never
// orders players differently from the stat tiles a player page shows.
function perGameRate(totalValue: number, gamesPlayed: number): number {
  return round(totalValue / gamesPlayed);
}

// True shooting from season totals — the same formula and rounding as
// deriveSeasonAverages (TS% = PTS / (2 * (FGA + 0.44 * FTA))).
function trueShootingPercentageFromTotals(totals: SeasonStatTotals): number {
  const trueShootingAttempts =
    totals.totalFieldGoalsAttempted + FREE_THROW_POSSESSION_WEIGHT * totals.totalFreeThrowsAttempted;
  if (trueShootingAttempts === 0) return 0;
  return round((totals.totalPoints / (POINTS_PER_SCORING_POSSESSION * trueShootingAttempts)) * 100);
}

// Just enough of a team for a matchup row to name its opponent — the same
// three fields every other team summary in this API carries.
export interface OpponentTeamSummary {
  id: string;
  name: string;
  abbreviation: string;
}

// How one player has scored against one opponent over the player's full
// ingested history in the segment.
export interface OpponentSplitEntry {
  opponent: OpponentTeamSummary;
  gamesPlayed: number;
  pointsPerGame: number;
}

// One still-unplayed game on the player's team schedule with the
// opponent-adjusted scoring projection attached — one chart point per
// upcoming game.
export interface UpcomingGameProjection {
  gameId: string;
  gameDate: Date;
  opponent: OpponentTeamSummary;
  isHome: boolean;
  projectedPoints: number;
}

export interface PlayerMatchupProjection {
  playerId: string;
  seasonType: SeasonType;
  overallPointsPerGame: number;
  splits: OpponentSplitEntry[];
  upcomingGames: UpcomingGameProjection[];
}

// Shrinkage prior for the opponent adjustment, in games: an opponent split
// over exactly this many games is trusted exactly halfway, and trust grows
// toward "the split is real" from there. Stops a two-game explosion against
// one team from moving a projection much, while a 20-game history mostly
// does.
const OPPONENT_PRIOR_GAMES = 8;

function opponentTrust(gamesPlayed: number): number {
  return gamesPlayed / (gamesPlayed + OPPONENT_PRIOR_GAMES);
}

// Blend the player's overall scoring rate with their opponent-specific one:
// the adjustment shrinks toward the overall rate as the sample grows, so an
// opponent the player has never faced projects exactly the overall rate.
function projectPointsAgainstOpponent(
  overallPointsPerGame: number,
  opponentPointsPerGame: number,
  gamesPlayed: number
): number {
  return round(
    overallPointsPerGame + (opponentPointsPerGame - overallPointsPerGame) * opponentTrust(gamesPlayed)
  );
}

// Running totals behind one opponent split — the map value while rows are
// being aggregated; pointsPerGame is derived once, at the end, rather than
// recomputed per row.
interface OpponentSplitTotals {
  opponent: OpponentTeamSummary;
  gamesPlayed: number;
  totalPoints: number;
}

@Injectable()
export class StatsService {
  constructor(
    private readonly playersService: PlayersService,
    private readonly gamesService: GamesService
  ) {}

  // Every figure here is derived from the raw per-game boxscore rows, which are
  // themselves derived from GameEvent rows — never a manually-entered total.
  deriveSeasonAverages(gameStats: PlayerGameStat[]): DerivedSeasonAverages {
    const totalFieldGoalsMade = gameStats.reduce((sum, stat) => sum + stat.fieldGoalsMade, 0);
    const totalFieldGoalsAttempted = gameStats.reduce((sum, stat) => sum + stat.fieldGoalsAttempted, 0);
    const totalThreesMade = gameStats.reduce((sum, stat) => sum + stat.threesMade, 0);
    const totalThreesAttempted = gameStats.reduce((sum, stat) => sum + stat.threesAttempted, 0);
    const totalFreeThrowsMade = gameStats.reduce((sum, stat) => sum + stat.freeThrowsMade, 0);
    const totalFreeThrowsAttempted = gameStats.reduce((sum, stat) => sum + stat.freeThrowsAttempted, 0);
    const totalPoints = gameStats.reduce((sum, stat) => sum + stat.points, 0);
    const totalAssists = gameStats.reduce((sum, stat) => sum + stat.assists, 0);
    const totalTurnovers = gameStats.reduce((sum, stat) => sum + stat.turnovers, 0);

    // Computed from season totals, not by averaging per-game percentages —
    // the same reason fieldGoalPercentage is. A 1-for-1 night and a
    // 5-for-20 night average to 52.5% per-game but are really 6-for-21.
    const trueShootingAttempts =
      totalFieldGoalsAttempted + FREE_THROW_POSSESSION_WEIGHT * totalFreeThrowsAttempted;

    return {
      gamesPlayed: gameStats.length,
      minutesPerGame: averageOf(gameStats.map((stat) => stat.minutes)),
      pointsPerGame: averageOf(gameStats.map((stat) => stat.points)),
      reboundsPerGame: averageOf(gameStats.map((stat) => stat.rebounds)),
      assistsPerGame: averageOf(gameStats.map((stat) => stat.assists)),
      stealsPerGame: averageOf(gameStats.map((stat) => stat.steals)),
      blocksPerGame: averageOf(gameStats.map((stat) => stat.blocks)),
      turnoversPerGame: averageOf(gameStats.map((stat) => stat.turnovers)),
      fieldGoalsMadePerGame: averageOf(gameStats.map((stat) => stat.fieldGoalsMade)),
      fieldGoalsAttemptedPerGame: averageOf(gameStats.map((stat) => stat.fieldGoalsAttempted)),
      fieldGoalPercentage: percentageOf(totalFieldGoalsMade, totalFieldGoalsAttempted),
      threesMadePerGame: averageOf(gameStats.map((stat) => stat.threesMade)),
      threesAttemptedPerGame: averageOf(gameStats.map((stat) => stat.threesAttempted)),
      threePointPercentage: percentageOf(totalThreesMade, totalThreesAttempted),
      freeThrowsMadePerGame: averageOf(gameStats.map((stat) => stat.freeThrowsMade)),
      freeThrowsAttemptedPerGame: averageOf(gameStats.map((stat) => stat.freeThrowsAttempted)),
      freeThrowPercentage: percentageOf(totalFreeThrowsMade, totalFreeThrowsAttempted),

      trueShootingPercentage:
        trueShootingAttempts === 0
          ? 0
          : round((totalPoints / (POINTS_PER_SCORING_POSSESSION * trueShootingAttempts)) * 100),
      effectiveFieldGoalPercentage: percentageOf(
        totalFieldGoalsMade + THREE_POINT_EFG_WEIGHT * totalThreesMade,
        totalFieldGoalsAttempted
      ),
      assistToTurnoverRatio: totalTurnovers === 0 ? null : roundToTwoDecimals(totalAssists / totalTurnovers),

      plusMinusPerGame: averageOfPresentValues(gameStats, (stat) => stat.plusMinus),
      usagePercentage: minutesWeightedAverage(gameStats, (stat) => stat.usagePercentage),
      offensiveRating: minutesWeightedAverage(gameStats, (stat) => stat.offensiveRating),
      defensiveRating: minutesWeightedAverage(gameStats, (stat) => stat.defensiveRating),
    };
  }

  // Chronological per-game points, oldest first — feeds trend charts on the frontend.
  deriveGameLog(gameStats: (PlayerGameStat & { game: Game })[]): GameLogEntry[] {
    return [...gameStats]
      .sort((a, b) => a.game.gameDate.getTime() - b.game.gameDate.getTime())
      .map((stat) => ({
        gameId: stat.gameId,
        gameDate: stat.game.gameDate,
        points: stat.points,
        season: stat.game.season,
      }));
  }

  async getPlayerSeasonAverages(
    playerId: string,
    seasonType: SeasonType = DEFAULT_SEASON_TYPE
  ): Promise<DerivedSeasonAverages> {
    const gameStats = await this.playersService.getPlayerSeasonStats(playerId, seasonType);
    return this.deriveSeasonAverages(gameStats);
  }

  async getPlayerGameLog(playerId: string, seasonType: SeasonType = DEFAULT_SEASON_TYPE): Promise<GameLogEntry[]> {
    const gameStats = await this.playersService.getPlayerSeasonStats(playerId, seasonType);
    return this.deriveGameLog(gameStats);
  }

  // Season averages + game log for many players in one request — see
  // PlayersService.getPlayerSeasonStatsBatch for why this exists. Every
  // requested id gets an entry (zeroed/empty for a player with no stat
  // rows), in the same order as `playerIds`, so a caller can zip the
  // response back up against its own request list without a lookup.
  //
  // `seasonType` narrows every entry to one segment; omitted, the rows span
  // every segment (the historical behaviour the reliability callers rely
  // on) — the same optional isolation getPlayerSeasonAverages documents.
  async getPlayerStatsBatch(playerIds: string[], seasonType?: SeasonType): Promise<PlayerStatsEntry[]> {
    const allGameStats = await this.playersService.getPlayerSeasonStatsBatch(playerIds, seasonType);

    const gameStatsByPlayerId = new Map<string, typeof allGameStats>();
    for (const stat of allGameStats) {
      const existing = gameStatsByPlayerId.get(stat.playerId);
      if (existing) existing.push(stat);
      else gameStatsByPlayerId.set(stat.playerId, [stat]);
    }

    return playerIds.map((playerId) => {
      const gameStats = gameStatsByPlayerId.get(playerId) ?? [];
      return {
        playerId,
        seasonAverages: this.deriveSeasonAverages(gameStats),
        gameLog: this.deriveGameLog(gameStats),
      };
    });
  }

  // One totals line per requested player, keyed by player id. Players with
  // no rows in the segment are simply absent from the map — the ranked
  // listing reads "no line" as "unranked", distinct from a zeroed line,
  // which would be a real (if empty) measurement.
  async getSeasonStatTotalsByPlayerId(
    playerIds: string[],
    seasonType: SeasonType
  ): Promise<Map<string, SeasonStatTotals>> {
    // Nothing to aggregate for an empty request — skip the round trip.
    if (playerIds.length === 0) return new Map();
    const totalsGroups = await this.playersService.getSeasonStatTotalsBatch(playerIds, seasonType);
    return new Map(
      totalsGroups.map((group) => [
        group.playerId,
        {
          playerId: group.playerId,
          gamesPlayed: group._count._all,
          totalPoints: group._sum.points ?? 0,
          totalRebounds: group._sum.rebounds ?? 0,
          totalAssists: group._sum.assists ?? 0,
          totalFieldGoalsAttempted: group._sum.fieldGoalsAttempted ?? 0,
          totalFreeThrowsAttempted: group._sum.freeThrowsAttempted ?? 0,
        },
      ])
    );
  }

  // The players list sorted by a season stat rather than alphabetically —
  // what the /players page's leaderboard view asks for. Sorting has to
  // happen here, across the whole filtered roster, because a client-side
  // sort of one page would silently present that page's best as if they
  // were the league's best.
  //
  // The figures come from the same season totals every other endpoint
  // derives its averages from — per-game rates and TS% share
  // deriveSeasonAverages' formulas and rounding (see perGameRate and
  // trueShootingPercentageFromTotals), so a ranking never disagrees with
  // the stat tiles a player page shows. Ranked, passed through the
  // minGames floor, and only then sliced to the requested page. Without a
  // recognised `sort` the ordering stays alphabetical (minGames alone is a
  // filter, not a ranking).
  async getPlayersRanked(query: Record<string, unknown>): Promise<PagedResult<PlayerWithTeam>> {
    const { page, pageSize } = parsePageParams(query);
    const sortKey = parsePlayerStatSort(query.sort);
    const minGames = parseMinGames(query.minGames);
    const seasonType = parseSeasonType(query.seasonType) ?? DEFAULT_SEASON_TYPE;

    const players = await this.playersService.getMatchingPlayers(query);
    const totalsByPlayerId = await this.getSeasonStatTotalsByPlayerId(
      players.map((player) => player.id),
      seasonType
    );

    // Stat rankings read as leaderboards (most first), so they default to
    // descending; the alphabetical default stays ascending. An explicit
    // `order` overrides either way.
    const sortOrder = parseSortOrder(query.order) ?? (sortKey ? "desc" : "asc");

    const ranked = players
      .map((player) => ({ player, totals: totalsByPlayerId.get(player.id) }))
      .filter(
        ({ totals }) => minGames === undefined || (totals !== undefined && totals.gamesPlayed >= minGames)
      )
      .sort((a, b) => {
        if (!sortKey) {
          const byLastName = a.player.lastName.localeCompare(b.player.lastName);
          return sortOrder === "asc" ? byLastName : -byLastName;
        }
        const selectSortValue = STAT_VALUE_BY_SORT_KEY[sortKey];
        // Players with no games in the segment sink to the bottom either
        // way — -Infinity under a descending sort, +Infinity under an
        // ascending one — so choosing "least first" never floats the
        // figure-less above the measured.
        const missingValueSink = sortOrder === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
        const valueA = a.totals ? selectSortValue(a.totals) : missingValueSink;
        const valueB = b.totals ? selectSortValue(b.totals) : missingValueSink;
        const byStat = sortOrder === "asc" ? valueA - valueB : valueB - valueA;
        // Last-name tiebreak keeps the ordering deterministic when two
        // players share a figure (two zeroed lines, for instance).
        return byStat || a.player.lastName.localeCompare(b.player.lastName);
      });

    return {
      data: ranked.slice((page - 1) * pageSize, page * pageSize).map((entry) => entry.player),
      page,
      pageSize,
      total: ranked.length,
    };
  }

  // Opponent-aware scoring projections for one player. Two halves, one
  // baseline: how the player has scored against every team they've faced,
  // and a projected points line for each still-unplayed game on their
  // team's schedule, adjusted toward (or away from) their rate against that
  // game's opponent by sample size (see projectPointsAgainstOpponent).
  //
  // The baseline is the player's full ingested history in the segment, not
  // just the latest season: opponent samples are small even across three
  // seasons, so every game against a team counts toward its split. A player
  // with no team (or a team with nothing left on the schedule) simply gets
  // an empty upcomingGames list, and the splits half still stands alone.
  async getMatchupProjection(
    playerId: string,
    rawSeasonType?: unknown
  ): Promise<PlayerMatchupProjection | null> {
    const seasonType = parseSeasonType(rawSeasonType) ?? DEFAULT_SEASON_TYPE;
    const player = await this.playersService.getPlayerById(playerId);
    if (!player) return null;

    const gameStats = await this.playersService.getPlayerGameStatsWithOpponents(playerId, seasonType);
    const splitTotalsByOpponentId = new Map<string, OpponentSplitTotals>();
    let attributedGames = 0;
    let attributedPoints = 0;

    for (const stat of gameStats) {
      // The side the player suited up for this game; Player.teamId is only
      // a fallback, since it drifts out of sync the moment a player is
      // traded (see PlayerGameStat.teamId's comment in schema.prisma).
      const playerSide = stat.teamId ?? player.teamId;
      if (!playerSide) continue;
      const isHomeGame = stat.game.homeTeamId === playerSide;
      // A stale fallback team matches neither side — skip rather than
      // misattribute the game to the wrong opponent.
      if (!isHomeGame && stat.game.awayTeamId !== playerSide) continue;

      const opponent = isHomeGame ? stat.game.awayTeam : stat.game.homeTeam;
      const existing = splitTotalsByOpponentId.get(opponent.id);
      if (existing) {
        existing.gamesPlayed += 1;
        existing.totalPoints += stat.points;
      } else {
        splitTotalsByOpponentId.set(opponent.id, {
          opponent: { id: opponent.id, name: opponent.name, abbreviation: opponent.abbreviation },
          gamesPlayed: 1,
          totalPoints: stat.points,
        });
      }
      attributedGames += 1;
      attributedPoints += stat.points;
    }

    const splits: OpponentSplitEntry[] = Array.from(splitTotalsByOpponentId.values())
      .map((totals) => ({
        opponent: totals.opponent,
        gamesPlayed: totals.gamesPlayed,
        pointsPerGame: round(totals.totalPoints / totals.gamesPlayed),
      }))
      .sort(
        (a, b) =>
          b.pointsPerGame - a.pointsPerGame ||
          a.opponent.abbreviation.localeCompare(b.opponent.abbreviation)
      );

    const overallRate = attributedGames > 0 ? attributedPoints / attributedGames : 0;
    const upcomingGames = player.teamId
      ? await this.gamesService.getUpcomingGamesForTeam(player.teamId, seasonType)
      : [];

    return {
      playerId: player.id,
      seasonType,
      overallPointsPerGame: round(overallRate),
      splits,
      upcomingGames: upcomingGames.map((game) => {
        const isHome = game.homeTeamId === player.teamId;
        const opponent = isHome ? game.awayTeam : game.homeTeam;
        const split = splitTotalsByOpponentId.get(opponent.id);
        return {
          gameId: game.id,
          gameDate: game.gameDate,
          opponent: { id: opponent.id, name: opponent.name, abbreviation: opponent.abbreviation },
          isHome,
          projectedPoints: split
            ? projectPointsAgainstOpponent(
                overallRate,
                split.totalPoints / split.gamesPlayed,
                split.gamesPlayed
              )
            : round(overallRate),
        };
      }),
    };
  }

  // The leader in each headline category for one segment — the four figures
  // behind the /players page's "League leaders" band. Every figure is
  // derived from the player's season totals with the same formulas and
  // rounding as the per-player season line (see perGameRate and
  // trueShootingPercentageFromTotals), ranked league-wide after the
  // participation floor; a category with no qualified player comes back
  // null rather than padded with a zero.
  async getSeasonLeaders(seasonType: SeasonType, minGames: number): Promise<SeasonLeaders> {
    // League-wide by definition — no team/position/search narrowing.
    const players = await this.playersService.getMatchingPlayers({});
    const totalsByPlayerId = await this.getSeasonStatTotalsByPlayerId(
      players.map((player) => player.id),
      seasonType
    );

    const pickLeader = (selectValue: (totals: SeasonStatTotals) => number): SeasonLeader | null => {
      let leader: SeasonLeader | null = null;
      for (const player of players) {
        const totals = totalsByPlayerId.get(player.id);
        if (!totals || totals.gamesPlayed < minGames) continue;
        const value = selectValue(totals);
        if (!leader || value > leader.value) {
          leader = { player, value, gamesPlayed: totals.gamesPlayed };
        }
      }
      return leader;
    };

    return {
      ppg: pickLeader((totals) => perGameRate(totals.totalPoints, totals.gamesPlayed)),
      rpg: pickLeader((totals) => perGameRate(totals.totalRebounds, totals.gamesPlayed)),
      apg: pickLeader((totals) => perGameRate(totals.totalAssists, totals.gamesPlayed)),
      tsPct: pickLeader(trueShootingPercentageFromTotals),
    };
  }

  // Every segment's season line in one response, for the "how did this
  // player's performance change between the regular season and the
  // postseason" view — the question the postseason feature exists to
  // answer, and the one case where showing segments side by side is the
  // point rather than a bleed.
  //
  // A segment the player didn't appear in comes back as a zeroed line with
  // gamesPlayed: 0 rather than being omitted, so the caller renders a
  // consistent set of columns and decides for itself how to present "didn't
  // play" — see deriveSeasonAverages, which returns zeros for an empty
  // input rather than throwing.
  async getPlayerSeasonSplits(playerId: string): Promise<PlayerSeasonSplits> {
    const segments = Object.values(SeasonType);
    const averagesPerSegment = await Promise.all(
      segments.map((seasonType) => this.getPlayerSeasonAverages(playerId, seasonType))
    );

    return Object.fromEntries(
      segments.map((seasonType, index) => [seasonType, averagesPerSegment[index]])
    ) as PlayerSeasonSplits;
  }
}
