import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma, SeasonType } from "@prisma/client";
import { ApiException } from "../common/api-exception.js";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { buildGameRoster, resolveSecondaryPlayer } from "./derive-player-game-stats.js";
import { creditStatFor, KNOWN_EVENT_TYPES } from "./event-correction-rules.js";
import { buildNamesByPlayerId, loadGameSnapshot, resolveGameTeamByPlayerId } from "./game-snapshot.js";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const TEAM_SUMMARY_SELECT = { id: true, name: true, abbreviation: true, city: true, logoUrl: true } as const;

export interface TeamSummary {
  id: string;
  name: string;
  abbreviation: string;
  city: string;
  logoUrl: string | null;
}

/** One game in the admin game lookup. */
export interface AdminGameSummary {
  id: string;
  nbaGameId: string;
  gameDate: Date;
  season: string;
  seasonType: SeasonType;
  homeTeam: TeamSummary;
  awayTeam: TeamSummary;
  homeScore: number | null;
  awayScore: number | null;
  // Older games hold only a handful of period markers; a game with real
  // play-by-play has hundreds of events.
  eventCount: number;
  correctionCount: number;
}

/** One play, with its player's name for display. */
export interface AdminGameEvent {
  sequence: number;
  period: number;
  clock: string;
  eventType: string;
  subType: string | null;
  playerId: string | null;
  playerName: string | null;
  teamId: string | null;
  success: boolean | null;
  value: number | null;
  description: string;
  // Who the description's assist/block/steal credit resolves to, exactly as
  // the stats derivation resolves it; null when there's none or it doesn't
  // resolve to one player.
  creditPlayerId: string | null;
  isCorrected: boolean;
}

/** A player with a box-score row for the game, and their team in it. */
export interface AdminRosterPlayer {
  id: string;
  firstName: string;
  lastName: string;
  teamId: string | null;
}

export interface AdminGamePlayByPlay {
  game: Omit<AdminGameSummary, "eventCount" | "correctionCount">;
  events: AdminGameEvent[];
  roster: AdminRosterPlayer[];
  // The platform's event vocabulary, so the edit form offers exactly the
  // types a correction will accept.
  eventTypes: readonly string[];
}

function badRequest(message: string): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", message);
}

/**
 * A YYYY-MM-DD query parameter as a UTC date, or undefined when absent.
 * @throws ApiException 400 when it's present but malformed.
 */
function parseDateParam(query: Record<string, unknown>, name: string): Date | undefined {
  const value = query[name];
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw badRequest(`${name} must be a date in YYYY-MM-DD form`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function parseStringParam(query: Record<string, unknown>, name: string): string | undefined {
  const value = query[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The Game filter for the admin lookup: season, a team on either side, and
 * an inclusive date window (toDate covers that whole day).
 * @throws ApiException 400 for a malformed or inverted date window.
 */
function buildGameFilter(query: Record<string, unknown>): Prisma.GameWhereInput {
  const season = parseStringParam(query, "season");
  const teamId = parseStringParam(query, "teamId");
  const fromDate = parseDateParam(query, "fromDate");
  const toDate = parseDateParam(query, "toDate");
  if (fromDate && toDate && fromDate > toDate) throw badRequest("fromDate must not be after toDate");

  const where: Prisma.GameWhereInput = {};
  if (season) where.season = season;
  if (teamId) where.OR = [{ homeTeamId: teamId }, { awayTeamId: teamId }];
  if (fromDate || toDate) {
    where.gameDate = {
      ...(fromDate && { gte: fromDate }),
      ...(toDate && { lt: new Date(toDate.getTime() + MILLISECONDS_PER_DAY) }),
    };
  }
  return where;
}

// Read side of the Corrections tab: finding a game, and showing its whole
// play-by-play with names. Corrections themselves go through
// AdminEventsService.
@Injectable()
export class AdminGamesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Games filtered by season, team and date window, most recent first,
   * with how many events and corrections each holds.
   * @throws ApiException 400 for a malformed date window.
   */
  async listGames(query: Record<string, unknown>): Promise<PagedResult<AdminGameSummary>> {
    const { page, pageSize } = parsePageParams(query);
    const where = buildGameFilter(query);
    const [games, total] = await Promise.all([
      this.prisma.game.findMany({
        where,
        select: {
          id: true,
          nbaGameId: true,
          gameDate: true,
          season: true,
          seasonType: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: TEAM_SUMMARY_SELECT },
          awayTeam: { select: TEAM_SUMMARY_SELECT },
          _count: { select: { events: true, corrections: true } },
        },
        orderBy: [{ gameDate: "desc" }, { nbaGameId: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.game.count({ where }),
    ]);

    const data = games.map(({ _count, ...game }) => ({
      ...game,
      eventCount: _count.events,
      correctionCount: _count.corrections,
    }));
    return { data, page, pageSize, total };
  }

  /**
   * One game's header, every event in sequence order (not paginated: a
   * full game is ~450-550 plays and the editor needs all of them), the
   * roster a play can be assigned to, and the event vocabulary.
   * @throws ApiException 404 when the game doesn't exist.
   */
  async getPlayByPlay(gameId: string): Promise<AdminGamePlayByPlay> {
    const [snapshot, game, correctedSequences] = await Promise.all([
      loadGameSnapshot(this.prisma, gameId),
      this.prisma.game.findUnique({
        where: { id: gameId },
        select: {
          id: true,
          nbaGameId: true,
          gameDate: true,
          season: true,
          seasonType: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: TEAM_SUMMARY_SELECT },
          awayTeam: { select: TEAM_SUMMARY_SELECT },
        },
      }),
      this.prisma.eventCorrection.findMany({ where: { gameId }, select: { sequence: true }, distinct: ["sequence"] }),
    ]);
    if (snapshot === null || game === null) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Game not found");

    const teamByPlayerId = resolveGameTeamByPlayerId(snapshot);
    const roster = [...snapshot.rosterPlayersById.values()]
      .map((player) => ({ id: player.id, firstName: player.firstName, lastName: player.lastName, teamId: teamByPlayerId.get(player.id) ?? null }))
      .sort((left, right) => left.lastName.localeCompare(right.lastName) || left.firstName.localeCompare(right.firstName));

    const nameByPlayerId = await this.loadPlayerNames(snapshot.events.map((event) => event.playerId));
    const correctedSequenceSet = new Set(correctedSequences.map((row) => row.sequence));
    const creditRoster = buildGameRoster(snapshot.events, buildNamesByPlayerId(snapshot));
    const resolveCredit = (event: (typeof snapshot.events)[number]) => {
      const stat = creditStatFor(event);
      return stat === null ? null : resolveSecondaryPlayer(event.description, stat, creditRoster, event.teamId);
    };
    const events = snapshot.events.map((event) => ({
      sequence: event.sequence,
      period: event.period,
      clock: event.clock,
      eventType: event.eventType,
      subType: event.subType,
      playerId: event.playerId,
      playerName: event.playerId === null ? null : (nameByPlayerId.get(event.playerId) ?? null),
      teamId: event.teamId,
      success: event.success,
      value: event.value,
      description: event.description,
      creditPlayerId: resolveCredit(event),
      isCorrected: correctedSequenceSet.has(event.sequence),
    }));
    return { game, events, roster, eventTypes: KNOWN_EVENT_TYPES };
  }

  /** playerId -> "First Last" for every distinct non-null id given. */
  private async loadPlayerNames(playerIds: (string | null)[]): Promise<Map<string, string>> {
    const distinctIds = [...new Set(playerIds.filter((playerId): playerId is string => playerId !== null))];
    const players = await this.prisma.player.findMany({
      where: { id: { in: distinctIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(players.map((player) => [player.id, `${player.firstName} ${player.lastName}`]));
  }
}
