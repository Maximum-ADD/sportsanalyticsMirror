import { z, type ZodError, type ZodType } from "zod";
import { LiveFeedUnavailableError } from "./live-feed-unavailable.error.js";
import { parseIsoDurationInSeconds } from "./live-game-clock.js";

// Validation and slimming for the NBA's live CDN feeds: the only place that
// knows their field names. Each parser checks the fields this feature reads
// and maps them onto this module's own shapes, so a renamed field surfaces as
// a LiveFeedUnavailableError naming the feed, never as `undefined` on a page.
//
// Validation is per item (game, player, play). The schedule really does carry
// placeholder games with null team codes (NBA Cup knockout slots before their
// teams are known), and one odd entry shouldn't blank the page. A feed where
// NO item matches is a changed format, and is rejected outright.

const GAME_ID_PATTERN = /^\d{10}$/;
const GAME_ID_PREFIX_LENGTH = 3;
const GAME_STATUS_NOT_STARTED = 1;
const GAME_STATUS_LIVE = 2;
const GAME_STATUS_FINAL = 3;
const NOT_POSTPONED = "N";
// How the schedule and scoreboard word a game that's on track: its tip-off
// time in US Eastern ("7:00 pm ET"). Every not-started game in the 2025-26 and
// 2026-27 schedules reads like this, apart from placeholders reading "TBD".
const TIP_OFF_TIME_PATTERN = /^\d{1,2}:\d{2} [ap]m ET$/i;
const FLAG_SET = "1";
const GAME_END_ACTION_TYPE = "game";
const GAME_END_SUB_TYPE = "end";
const MADE_SHOT_RESULT = "Made";

// A game id's first three digits give its season type.
const SEASON_TYPE_BY_GAME_ID_PREFIX: Record<string, string> = {
  "001": "Preseason",
  "002": "Regular Season",
  "003": "All-Star",
  "004": "Playoffs",
  "005": "Play-In",
  "006": "NBA Cup Final",
};

export interface ScheduledTeam {
  teamId: number;
  tricode: string;
  city: string;
  name: string;
}

/** A game from the schedule or scoreboard: who plays, and when it starts. */
export interface ScheduledGame {
  gameId: string;
  /** "Preseason", "Playoffs" and so on; null for an unrecognised game id prefix. */
  seasonType: string | null;
  /** Scheduled tip-off, UTC ISO 8601. */
  startsAt: string;
  /**
   * The feed's own status, when a game that hasn't started reads as anything
   * other than a tip-off time ("TBD", or presumably "PPD" for a postponement),
   * so the page can show it instead of a countdown. Null for a game on track.
   * No real postponement has been seen in the feed yet (none in the 2025-26 or
   * 2026-27 schedules as of 2026-10-06), so this is a defensive reading.
   */
  statusNote: string | null;
  homeTeam: ScheduledTeam;
  awayTeam: ScheduledTeam;
}

export type LiveGameStatus = "live" | "final";

/** One player's line in the box score. */
export interface LivePlayerLine {
  personId: number;
  name: string;
  /** "D. Hunter": the short form a box score table shows. */
  shortName: string;
  jerseyNumber: string;
  /** Only starters carry a position in the feed. */
  position: string | null;
  isStarter: boolean;
  hasPlayed: boolean;
  /** Minutes played as an ISO 8601 duration, e.g. "PT27M25.00S". */
  minutes: string;
  points: number;
  assists: number;
  rebounds: number;
  turnovers: number;
  steals: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  plusMinus: number;
}

export interface LiveTeamLine {
  teamId: number;
  tricode: string;
  city: string;
  name: string;
  score: number;
  /** In the feed's display order: starters first. */
  players: LivePlayerLine[];
}

/** A game that has tipped off: live, or final. */
export interface LiveBoxScore {
  gameId: string;
  /** "Preseason", "Playoffs" and so on; null for an unrecognised game id prefix. */
  seasonType: string | null;
  status: LiveGameStatus;
  /** The feed's own one-line status, e.g. "Half" or "Final". */
  statusText: string;
  period: number;
  regulationPeriods: number;
  /** Time left in the period as an ISO 8601 duration; null when the feed sends none (between periods). */
  gameClock: string | null;
  /** Scheduled tip-off, UTC ISO 8601. */
  startsAt: string;
  homeTeam: LiveTeamLine;
  awayTeam: LiveTeamLine;
}

export interface LivePlay {
  actionNumber: number;
  orderNumber: number;
  period: number;
  /** Time left in the period, ISO 8601 duration. */
  clock: string;
  /** Null for game-level actions such as a period starting. */
  teamTricode: string | null;
  description: string;
  homeScore: number;
  awayScore: number;
  isScoringPlay: boolean;
}

export interface LivePlayByPlay {
  plays: LivePlay[];
  /** When the "Game End" action was logged (UTC ISO 8601); null until then. */
  endedAt: string | null;
}

const gameIdSchema = z.string().regex(GAME_ID_PATTERN);
const timestampSchema = z.iso.datetime();
// The box score sends booleans as "1"/"0" strings.
const flagSchema = z.enum(["0", "1"]).transform((flag) => flag === FLAG_SET);
// The play-by-play sends running scores as numeric strings ("127").
const scoreTextSchema = z.coerce.number().int().nonnegative();

// Placeholder games (NBA Cup knockout slots) carry teamId 0 and null names,
// so they fail here and are left out.
const scheduledTeamSchema = z.object({
  teamId: z.number().int().positive(),
  teamTricode: z.string().min(1),
  teamCity: z.string(),
  teamName: z.string(),
});

const scheduleSchema = z.object({
  leagueSchedule: z.object({ gameDates: z.array(z.object({ games: z.array(z.unknown()) })) }),
});

const scheduleGameSchema = z.object({
  gameId: gameIdSchema,
  gameDateTimeUTC: timestampSchema,
  gameStatus: z.number().int(),
  gameStatusText: z.string(),
  postponedStatus: z.string().optional(),
  homeTeam: scheduledTeamSchema,
  awayTeam: scheduledTeamSchema,
});

const scoreboardSchema = z.object({ scoreboard: z.object({ games: z.array(z.unknown()) }) });

const scoreboardGameSchema = z.object({
  gameId: gameIdSchema,
  gameTimeUTC: timestampSchema,
  gameStatus: z.number().int(),
  gameStatusText: z.string(),
  homeTeam: scheduledTeamSchema,
  awayTeam: scheduledTeamSchema,
});

const boxScoreStatusSchema = z.object({ game: z.object({ gameStatus: z.number().int() }) });

const teamSchema = z.object({
  teamId: z.number().int(),
  teamTricode: z.string(),
  teamCity: z.string(),
  teamName: z.string(),
  score: z.number().int(),
  players: z.array(z.unknown()),
});

const boxScoreSchema = z.object({
  game: z.object({
    gameId: gameIdSchema,
    gameStatus: z.union([z.literal(GAME_STATUS_LIVE), z.literal(GAME_STATUS_FINAL)]),
    gameStatusText: z.string(),
    period: z.number().int().nonnegative(),
    regulationPeriods: z.number().int().positive(),
    gameClock: z.string(),
    gameTimeUTC: timestampSchema,
    homeTeam: teamSchema,
    awayTeam: teamSchema,
  }),
});

const playerSchema = z.object({
  personId: z.number().int(),
  name: z.string(),
  nameI: z.string(),
  jerseyNum: z.string(),
  position: z.string().optional(),
  starter: flagSchema,
  played: flagSchema,
  statistics: z.object({
    minutes: z.string(),
    points: z.number(),
    assists: z.number(),
    reboundsTotal: z.number(),
    turnovers: z.number(),
    steals: z.number(),
    fieldGoalsMade: z.number(),
    fieldGoalsAttempted: z.number(),
    threePointersMade: z.number(),
    threePointersAttempted: z.number(),
    freeThrowsMade: z.number(),
    freeThrowsAttempted: z.number(),
    plusMinusPoints: z.number(),
  }),
});

const playByPlaySchema = z.object({ game: z.object({ actions: z.array(z.unknown()) }) });

const playSchema = z.object({
  actionNumber: z.number().int(),
  orderNumber: z.number().int(),
  period: z.number().int().positive(),
  clock: z.string(),
  timeActual: z.string(),
  actionType: z.string(),
  subType: z.string().optional(),
  teamTricode: z.string().optional(),
  description: z.string().optional(),
  scoreHome: scoreTextSchema,
  scoreAway: scoreTextSchema,
  shotResult: z.string().optional(),
});

type ScheduledTeamPayload = z.infer<typeof scheduledTeamSchema>;
type TeamPayload = z.infer<typeof teamSchema>;
type PlayerPayload = z.infer<typeof playerSchema>;
type PlayPayload = z.infer<typeof playSchema>;

// What toScheduledGame needs; the schedule and scoreboard name the start differently.
interface ScheduledGamePayload {
  gameId: string;
  startsAt: string;
  gameStatus: number;
  gameStatusText: string;
  postponedStatus?: string;
  homeTeam: ScheduledTeamPayload;
  awayTeam: ScheduledTeamPayload;
}

/**
 * Reads the season's schedule, slimmed to what the page uses: each game's id,
 * start, teams and any status note. The rest of the ~5 MB file is dropped.
 *
 * @param payload - scheduleLeagueV2.json, parsed.
 * @returns every game whose fields check out, placeholders without teams left out.
 * @throws LiveFeedUnavailableError if the structure has changed.
 */
export function parseSchedule(payload: unknown): ScheduledGame[] {
  const schedule = parseFeed(scheduleSchema, payload, "schedule");
  const rawGames = schedule.leagueSchedule.gameDates.flatMap((gameDate) => gameDate.games);
  return keepValidItems(rawGames, scheduleGameSchema, "schedule").map((game) =>
    toScheduledGame({ ...game, startsAt: game.gameDateTimeUTC })
  );
}

/**
 * Reads today's scoreboard (the current NBA day, US Eastern) into the same
 * shape as the schedule, so the two can be merged.
 *
 * @param payload - todaysScoreboard_00.json, parsed.
 * @throws LiveFeedUnavailableError if the structure has changed.
 */
export function parseScoreboard(payload: unknown): ScheduledGame[] {
  const scoreboard = parseFeed(scoreboardSchema, payload, "scoreboard");
  return keepValidItems(scoreboard.scoreboard.games, scoreboardGameSchema, "scoreboard").map((game) =>
    toScheduledGame({ ...game, startsAt: game.gameTimeUTC })
  );
}

/**
 * Reads one game's box score.
 *
 * @param payload - boxscore_<gameId>.json, parsed.
 * @returns the game, or null while it hasn't tipped off. The feed publishes a
 *   pre-game file (status 1) before tip-off, and it isn't checked any further
 *   because nothing in it is shown.
 * @throws LiveFeedUnavailableError if the structure has changed.
 */
export function parseBoxScore(payload: unknown): LiveBoxScore | null {
  const { game: gameState } = parseFeed(boxScoreStatusSchema, payload, "box score");
  if (gameState.gameStatus === GAME_STATUS_NOT_STARTED) return null;

  const { game } = parseFeed(boxScoreSchema, payload, "box score");
  return {
    gameId: game.gameId,
    seasonType: describeSeasonType(game.gameId),
    status: game.gameStatus === GAME_STATUS_LIVE ? "live" : "final",
    statusText: game.gameStatusText,
    period: game.period,
    regulationPeriods: game.regulationPeriods,
    gameClock: parseIsoDurationInSeconds(game.gameClock) === null ? null : game.gameClock,
    startsAt: game.gameTimeUTC,
    homeTeam: toTeamLine(game.homeTeam),
    awayTeam: toTeamLine(game.awayTeam),
  };
}

/**
 * Reads one game's play-by-play.
 *
 * @param payload - playbyplay_<gameId>.json, parsed. About 430 KB per game.
 * @returns every play, plus the time the game ended once it has.
 * @throws LiveFeedUnavailableError if the structure has changed.
 */
export function parsePlayByPlay(payload: unknown): LivePlayByPlay {
  const playByPlay = parseFeed(playByPlaySchema, payload, "play-by-play");
  const actions = keepValidItems(playByPlay.game.actions, playSchema, "play-by-play");
  return { plays: actions.map(toPlay), endedAt: findGameEndTime(actions) };
}

// Parses a feed's outer structure, which has to match for any of it to be usable.
function parseFeed<T>(schema: ZodType<T>, payload: unknown, feedName: string): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  throw new LiveFeedUnavailableError(`The NBA ${feedName} feed is in an unexpected format (${describeIssue(result.error)})`);
}

// Keeps the items that match `schema` and drops the rest. Throws only when
// there were items and none matched: a renamed field, not one odd entry.
function keepValidItems<T>(items: unknown[], schema: ZodType<T>, feedName: string): T[] {
  const results = items.map((item) => schema.safeParse(item));
  const validItems = results.flatMap((result) => (result.success ? [result.data] : []));
  const firstFailure = results.find((result) => !result.success);
  if (validItems.length === 0 && firstFailure?.error) {
    throw new LiveFeedUnavailableError(
      `No entry in the NBA ${feedName} feed is in the expected format (${describeIssue(firstFailure.error)})`
    );
  }
  return validItems;
}

// "homeTeam.teamTricode: Invalid input: expected string, received null"
function describeIssue(error: ZodError): string {
  const [issue] = error.issues;
  if (!issue) return "no details";
  const fieldPath = issue.path.join(".");
  return fieldPath ? `${fieldPath}: ${issue.message}` : issue.message;
}

function describeSeasonType(gameId: string): string | null {
  return SEASON_TYPE_BY_GAME_ID_PREFIX[gameId.slice(0, GAME_ID_PREFIX_LENGTH)] ?? null;
}

function toScheduledGame(game: ScheduledGamePayload): ScheduledGame {
  return {
    gameId: game.gameId,
    seasonType: describeSeasonType(game.gameId),
    startsAt: game.startsAt,
    statusNote: describeStatusNote(game),
    homeTeam: toScheduledTeam(game.homeTeam),
    awayTeam: toScheduledTeam(game.awayTeam),
  };
}

function toScheduledTeam(team: ScheduledTeamPayload): ScheduledTeam {
  return { teamId: team.teamId, tricode: team.teamTricode, city: team.teamCity, name: team.teamName };
}

// A not-started game's status text, when it isn't a plain tip-off time: the
// feed's way of saying the time is unknown ("TBD") or the game won't happen
// as scheduled. A game flagged as postponed always gets a note. Once a game
// has started, its box score speaks for it instead, so it gets none. The
// feed pads some texts with trailing spaces ("Final      "), hence the trim.
function describeStatusNote(game: ScheduledGamePayload): string | null {
  const statusText = game.gameStatusText.trim();
  const isPostponed = game.postponedStatus !== undefined && game.postponedStatus !== NOT_POSTPONED;
  if (isPostponed) return statusText || "Postponed";
  if (game.gameStatus !== GAME_STATUS_NOT_STARTED || TIP_OFF_TIME_PATTERN.test(statusText)) return null;
  return statusText || null;
}

function toTeamLine(team: TeamPayload): LiveTeamLine {
  return {
    teamId: team.teamId,
    tricode: team.teamTricode,
    city: team.teamCity,
    name: team.teamName,
    score: team.score,
    players: keepValidItems(team.players, playerSchema, "box score").map(toPlayerLine),
  };
}

function toPlayerLine(player: PlayerPayload): LivePlayerLine {
  const { statistics } = player;
  return {
    personId: player.personId,
    name: player.name,
    shortName: player.nameI,
    jerseyNumber: player.jerseyNum,
    position: player.position || null,
    isStarter: player.starter,
    hasPlayed: player.played,
    minutes: statistics.minutes,
    points: statistics.points,
    assists: statistics.assists,
    rebounds: statistics.reboundsTotal,
    turnovers: statistics.turnovers,
    steals: statistics.steals,
    fieldGoalsMade: statistics.fieldGoalsMade,
    fieldGoalsAttempted: statistics.fieldGoalsAttempted,
    threePointersMade: statistics.threePointersMade,
    threePointersAttempted: statistics.threePointersAttempted,
    freeThrowsMade: statistics.freeThrowsMade,
    freeThrowsAttempted: statistics.freeThrowsAttempted,
    plusMinus: statistics.plusMinusPoints,
  };
}

function toPlay(action: PlayPayload): LivePlay {
  return {
    actionNumber: action.actionNumber,
    orderNumber: action.orderNumber,
    period: action.period,
    clock: action.clock,
    teamTricode: action.teamTricode || null,
    description: action.description ?? "",
    homeScore: action.scoreHome,
    awayScore: action.scoreAway,
    isScoringPlay: action.shotResult === MADE_SHOT_RESULT,
  };
}

// The "Game End" action's timestamp. The feed logs it once, as the last
// action; taking the last match still copes with a game ended twice.
function findGameEndTime(actions: PlayPayload[]): string | null {
  const gameEndAction = actions
    .filter((action) => action.actionType === GAME_END_ACTION_TYPE && action.subType === GAME_END_SUB_TYPE)
    .at(-1);
  if (!gameEndAction || !timestampSchema.safeParse(gameEndAction.timeActual).success) return null;
  return gameEndAction.timeActual;
}
