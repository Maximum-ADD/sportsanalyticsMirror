import { Inject, Injectable, Logger } from "@nestjs/common";
import { buildCacheKey, type ResponseCacheService } from "../cache/response-cache.service.js";
import { LiveFeedUnavailableError } from "./live-feed-unavailable.error.js";
import { selectRecentPlays } from "./live-game-clock.js";
import { NbaLiveFeed } from "./nba-live-feed.js";
import type {
  LiveBoxScore,
  LiveGameStatus,
  LivePlay,
  LivePlayerLine,
  LiveTeamLine,
  ScheduledGame,
} from "./nba-live-feed-parsers.js";

// The live page's data, read on demand from the NBA's live feed and held only
// in memory: nothing here touches the database. Every read goes through the
// module's own cache (LIVE_FEED_CACHE, see live-games.module.ts), so however
// many people are watching, the CDN sees about one request per file per
// lifetime below, and a cold cache costs one wait, not one per viewer.

export const LIVE_FEED_CACHE = Symbol("LIVE_FEED_CACHE");

const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_MINUTE = 60 * MILLISECONDS_PER_SECOND;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;

// The Recent section: games that finished within this long. Keeps the
// previous night's games (roughly 01:00-07:00 SAST) up until around midnight.
// On days with US afternoon games (weekends, holidays), which finish in the
// South African evening, the two nights can share the section for a few
// hours; it's sorted by finish, so the newer games lead.
const RECENT_FINISH_WINDOW_IN_MILLISECONDS = 18 * MILLISECONDS_PER_HOUR;
// A generous bound on tip-off to final buzzer, overtimes included. A game
// that started this long before the Recent window opened can still have
// finished inside it, so candidates are searched for across both together.
const LONGEST_GAME_IN_MILLISECONDS = 4 * MILLISECONDS_PER_HOUR;
const CANDIDATE_START_WINDOW_IN_MILLISECONDS = RECENT_FINISH_WINDOW_IN_MILLISECONDS + LONGEST_GAME_IN_MILLISECONDS;
// The Upcoming section: games starting within this long. A whole next night
// of games, whenever someone looks.
const UPCOMING_WINDOW_IN_MILLISECONDS = 24 * MILLISECONDS_PER_HOUR;

// Game ids and start times barely change; changes made on the day still show
// up through the scoreboard, which is laid over the schedule.
const SCHEDULE_TTL_IN_MILLISECONDS = 24 * MILLISECONDS_PER_HOUR;
const SCOREBOARD_TTL_IN_MILLISECONDS = MILLISECONDS_PER_MINUTE;
// A game in progress: close to as fresh as the feed itself.
const IN_PROGRESS_TTL_IN_MILLISECONDS = 10 * MILLISECONDS_PER_SECOND;
// A game past its start time whose box score isn't up yet, or that hasn't
// tipped off: it's due any moment, so it's checked again soon.
const NOT_STARTED_TTL_IN_MILLISECONDS = 15 * MILLISECONDS_PER_SECOND;
// The NBA corrects stats for a while after the final buzzer, so a finished
// game is re-read every minute at first, then hourly once it has settled.
const FINAL_SETTLING_WINDOW_IN_MILLISECONDS = 15 * MILLISECONDS_PER_MINUTE;
const SETTLING_FINAL_TTL_IN_MILLISECONDS = MILLISECONDS_PER_MINUTE;
const SETTLED_FINAL_TTL_IN_MILLISECONDS = MILLISECONDS_PER_HOUR;
// When a game ended never changes once the feed has logged it.
const KNOWN_END_TIME_TTL_IN_MILLISECONDS = 6 * MILLISECONDS_PER_HOUR;

export interface LiveTeamSummary {
  teamId: number;
  tricode: string;
  city: string;
  name: string;
  score: number;
}

/** A live or finished game's card. Times are UTC ISO 8601; clocks are ISO 8601 durations. */
export interface LiveGameSummary {
  gameId: string;
  seasonType: string | null;
  status: LiveGameStatus;
  statusText: string;
  period: number;
  regulationPeriods: number;
  gameClock: string | null;
  startsAt: string;
  endedAt: string | null;
  homeTeam: LiveTeamSummary;
  awayTeam: LiveTeamSummary;
}

/** The live page's three sections. */
export interface LiveGamesBoard {
  /** Games in progress, earliest tip-off first. */
  live: LiveGameSummary[];
  /**
   * Games starting within 24 hours, soonest first. Includes games past their
   * start time whose box score hasn't appeared yet: the page shows those as
   * "Starting soon" until they tip off and move to Live.
   */
  upcoming: ScheduledGame[];
  /** Games that finished within 18 hours, most recent finish first. */
  recent: LiveGameSummary[];
}

export interface LiveGameDetail {
  game: LiveGameSummary;
  /** Players who have taken the floor, in box score order (starters first). */
  homePlayers: LivePlayerLine[];
  awayPlayers: LivePlayerLine[];
  /**
   * The last five minutes of play, latest first. Null for a finished game,
   * and for a live one whose play-by-play couldn't be read.
   */
  recentPlays: LivePlay[] | null;
}

// What's cached per game: its box score (null until tip-off) and, once it's
// final, when it ended. The two are kept together because how long the box
// score stays fresh depends on how long ago the game ended.
interface GameSnapshot {
  boxScore: LiveBoxScore | null;
  endedAt: string | null;
}

interface StartedGameSnapshot extends GameSnapshot {
  boxScore: LiveBoxScore;
}

interface BoardSnapshots {
  liveGames: StartedGameSnapshot[];
  upcomingGames: ScheduledGame[];
  recentGames: StartedGameSnapshot[];
}

@Injectable()
export class LiveGamesService {
  private readonly logger = new Logger(LiveGamesService.name);

  constructor(
    private readonly feed: NbaLiveFeed,
    @Inject(LIVE_FEED_CACHE) private readonly cache: ResponseCacheService
  ) {}

  /**
   * The live page's three sections: games in progress, games starting within
   * 24 hours, and games that finished within 18 hours.
   *
   * @throws LiveFeedUnavailableError when neither the schedule nor the
   *   scoreboard can be read, or when no candidate game's box score can.
   */
  async getLiveGames(): Promise<LiveGamesBoard> {
    const { liveGames, upcomingGames, recentGames } = await this.collectBoard();
    return {
      live: liveGames.map(toGameSummary),
      upcoming: upcomingGames,
      recent: recentGames.map(toGameSummary),
    };
  }

  /**
   * One live or recently finished game, with its box score and, while it's
   * live, the last five minutes of play.
   *
   * @param gameId - the NBA's ten-digit game id.
   * @returns null when the game isn't live or recent (upcoming games have no
   *   box score yet). Only games on the board are ever read, so a caller
   *   can't point this at an arbitrary feed file.
   * @throws LiveFeedUnavailableError as getLiveGames does.
   */
  async getLiveGame(gameId: string): Promise<LiveGameDetail | null> {
    const { liveGames, recentGames } = await this.collectBoard();
    const listedGame = [...liveGames, ...recentGames].find((snapshot) => snapshot.boxScore.gameId === gameId);
    if (!listedGame) return null;

    const { boxScore } = listedGame;
    return {
      game: toGameSummary(listedGame),
      homePlayers: selectPlayersWhoPlayed(boxScore.homeTeam),
      awayPlayers: selectPlayersWhoPlayed(boxScore.awayTeam),
      recentPlays: boxScore.status === "live" ? await this.findRecentPlays(gameId) : null,
    };
  }

  // The plan's list algorithm. Candidates are games scheduled to start within
  // the last 22 hours, and each one's box score sorts it: live, final (kept if
  // it ended within 18 hours), or not tipped off yet ("Starting soon", shown
  // with Upcoming). Games due within 24 hours come straight from the
  // schedule, since nothing more exists for them before tip-off.
  private async collectBoard(): Promise<BoardSnapshots> {
    const nowEpochMilliseconds = Date.now();
    const knownGames = await this.getKnownGames();
    const candidateGames = selectCandidateGames(knownGames, nowEpochMilliseconds);
    const snapshotsByGameId = await this.getCandidateSnapshots(candidateGames);
    const startedGames = [...snapshotsByGameId.values()].filter(hasStarted);
    const startingSoonGames = candidateGames.filter((game) => snapshotsByGameId.get(game.gameId)?.boxScore === null);

    return {
      liveGames: startedGames.filter(isLive).sort(compareEarliestStartFirst),
      upcomingGames: [...startingSoonGames, ...selectUpcomingGames(knownGames, nowEpochMilliseconds)].sort(
        compareSoonestStartFirst
      ),
      recentGames: startedGames
        .filter((snapshot) => isRecentFinish(snapshot, nowEpochMilliseconds))
        .sort(compareMostRecentFinishFirst),
    };
  }

  // The schedule, with today's scoreboard laid over it. The scoreboard is at
  // most a minute old, so its start times and status notes win, and it still
  // covers today's games if the schedule can't be read. Fails only if neither
  // can be.
  private async getKnownGames(): Promise<ScheduledGame[]> {
    const [scheduleResult, scoreboardResult] = await Promise.allSettled([
      this.cache.getOrLoad(buildCacheKey("live:schedule"), SCHEDULE_TTL_IN_MILLISECONDS, () => this.feed.getSchedule()),
      this.cache.getOrLoad(buildCacheKey("live:scoreboard"), SCOREBOARD_TTL_IN_MILLISECONDS, () => this.feed.getScoreboard()),
    ]);
    if (scheduleResult.status === "rejected" && scoreboardResult.status === "rejected") {
      throw scheduleResult.reason;
    }
    return mergeByGameId(this.readGamesOrNone(scheduleResult, "schedule"), this.readGamesOrNone(scoreboardResult, "scoreboard"));
  }

  private readGamesOrNone(result: PromiseSettledResult<ScheduledGame[]>, feedName: string): ScheduledGame[] {
    if (result.status === "fulfilled") return result.value;
    this.logger.warn(`Live ${feedName} unavailable, carrying on without it: ${describeError(result.reason)}`);
    return [];
  }

  // Reads every candidate side by side, keyed by game id. One unreadable game
  // is left out (and logged) rather than failing the page; every one of them
  // failing means the feed is down, and is reported as that instead of as
  // an empty page.
  private async getCandidateSnapshots(candidateGames: ScheduledGame[]): Promise<Map<string, GameSnapshot>> {
    const results = await Promise.allSettled(candidateGames.map((game) => this.getGameSnapshot(game.gameId)));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length > 0 && failures.length === results.length) throw failures[0].reason;

    for (const failure of failures) {
      this.logger.warn(`Live game left off the page: ${describeError(failure.reason)}`);
    }
    const snapshotsByGameId = new Map<string, GameSnapshot>();
    results.forEach((result, index) => {
      if (result.status === "fulfilled") snapshotsByGameId.set(candidateGames[index].gameId, result.value);
    });
    return snapshotsByGameId;
  }

  private getGameSnapshot(gameId: string): Promise<GameSnapshot> {
    return this.cache.getOrLoad(buildCacheKey("live:game", [gameId]), computeSnapshotTtl, async () => {
      const boxScore = await this.feed.getBoxScore(gameId);
      const endedAt = boxScore?.status === "final" ? await this.findGameEndTime(gameId) : null;
      return { boxScore, endedAt };
    });
  }

  // When a final game ended, from its play-by-play. It only places the game
  // on the page and labels its card, so an unreadable play-by-play leaves it
  // unknown rather than dropping the game.
  private async findGameEndTime(gameId: string): Promise<string | null> {
    const gameEnd = await this.readOptionally(`the end time of game ${gameId}`, () =>
      this.cache.getOrLoad(buildCacheKey("live:game-end", [gameId]), computeGameEndTtl, async () => {
        const playByPlay = await this.feed.getPlayByPlay(gameId);
        return { endedAt: playByPlay?.endedAt ?? null };
      })
    );
    return gameEnd?.endedAt ?? null;
  }

  // A live game's last five minutes of play. Null when the play-by-play
  // can't be read: the box score is still worth showing without it.
  private findRecentPlays(gameId: string): Promise<LivePlay[] | null> {
    return this.readOptionally(`the recent plays of game ${gameId}`, () =>
      this.cache.getOrLoad(buildCacheKey("live:recent-plays", [gameId]), IN_PROGRESS_TTL_IN_MILLISECONDS, async () => {
        const playByPlay = await this.feed.getPlayByPlay(gameId);
        return selectRecentPlays(playByPlay?.plays ?? []);
      })
    );
  }

  // Runs a read whose result the page can do without: a feed outage becomes
  // null (and a log line); anything else is a bug and still throws.
  private async readOptionally<T>(description: string, read: () => Promise<T>): Promise<T | null> {
    try {
      return await read();
    } catch (error) {
      if (!(error instanceof LiveFeedUnavailableError)) throw error;
      this.logger.warn(`Could not read ${description}: ${error.message}`);
      return null;
    }
  }
}

function mergeByGameId(scheduledGames: ScheduledGame[], overridingGames: ScheduledGame[]): ScheduledGame[] {
  const gamesById = new Map(scheduledGames.map((game) => [game.gameId, game]));
  for (const game of overridingGames) gamesById.set(game.gameId, game);
  return [...gamesById.values()];
}

// Games whose scheduled start has passed within the candidate window: the
// ones that may be live, recently finished, or running late.
function selectCandidateGames(knownGames: ScheduledGame[], nowEpochMilliseconds: number): ScheduledGame[] {
  const earliestStartEpochMilliseconds = nowEpochMilliseconds - CANDIDATE_START_WINDOW_IN_MILLISECONDS;
  return knownGames.filter((game) => {
    const startEpochMilliseconds = Date.parse(game.startsAt);
    return startEpochMilliseconds >= earliestStartEpochMilliseconds && startEpochMilliseconds <= nowEpochMilliseconds;
  });
}

// Games due to start within the Upcoming window.
function selectUpcomingGames(knownGames: ScheduledGame[], nowEpochMilliseconds: number): ScheduledGame[] {
  const latestStartEpochMilliseconds = nowEpochMilliseconds + UPCOMING_WINDOW_IN_MILLISECONDS;
  return knownGames.filter((game) => {
    const startEpochMilliseconds = Date.parse(game.startsAt);
    return startEpochMilliseconds > nowEpochMilliseconds && startEpochMilliseconds <= latestStartEpochMilliseconds;
  });
}

function hasStarted(snapshot: GameSnapshot): snapshot is StartedGameSnapshot {
  return snapshot.boxScore !== null;
}

function isLive(snapshot: StartedGameSnapshot): boolean {
  return snapshot.boxScore.status === "live";
}

// A final game whose end time couldn't be read still counts as recent: it
// started inside the candidate window, so it's recent either way.
function isRecentFinish(snapshot: StartedGameSnapshot, nowEpochMilliseconds: number): boolean {
  if (snapshot.boxScore.status !== "final") return false;
  if (snapshot.endedAt === null) return true;
  return nowEpochMilliseconds - Date.parse(snapshot.endedAt) <= RECENT_FINISH_WINDOW_IN_MILLISECONDS;
}

function compareEarliestStartFirst(first: StartedGameSnapshot, second: StartedGameSnapshot): number {
  return Date.parse(first.boxScore.startsAt) - Date.parse(second.boxScore.startsAt);
}

function compareSoonestStartFirst(first: ScheduledGame, second: ScheduledGame): number {
  return Date.parse(first.startsAt) - Date.parse(second.startsAt);
}

// Most recent finish first, with any whose end time is unknown last.
function compareMostRecentFinishFirst(first: StartedGameSnapshot, second: StartedGameSnapshot): number {
  if (first.endedAt === second.endedAt) return 0;
  if (first.endedAt === null) return 1;
  if (second.endedAt === null) return -1;
  return Date.parse(second.endedAt) - Date.parse(first.endedAt);
}

function computeSnapshotTtl(snapshot: GameSnapshot): number {
  if (snapshot.boxScore === null) return NOT_STARTED_TTL_IN_MILLISECONDS;
  if (snapshot.boxScore.status === "live") return IN_PROGRESS_TTL_IN_MILLISECONDS;
  return hasSettled(snapshot.endedAt) ? SETTLED_FINAL_TTL_IN_MILLISECONDS : SETTLING_FINAL_TTL_IN_MILLISECONDS;
}

// Whether a final game ended long enough ago that late stat corrections are
// unlikely. An unknown end time counts as not yet, so it's re-read sooner.
function hasSettled(endedAt: string | null): boolean {
  return endedAt !== null && Date.now() - Date.parse(endedAt) >= FINAL_SETTLING_WINDOW_IN_MILLISECONDS;
}

// An end time not logged yet (the box score can go final a little before the
// play-by-play does) is looked for again soon; a known one is kept.
function computeGameEndTtl(gameEnd: { endedAt: string | null }): number {
  return gameEnd.endedAt === null ? SETTLING_FINAL_TTL_IN_MILLISECONDS : KNOWN_END_TIME_TTL_IN_MILLISECONDS;
}

function selectPlayersWhoPlayed(team: LiveTeamLine): LivePlayerLine[] {
  return team.players.filter((player) => player.hasPlayed);
}

function toGameSummary({ boxScore, endedAt }: StartedGameSnapshot): LiveGameSummary {
  return {
    gameId: boxScore.gameId,
    seasonType: boxScore.seasonType,
    status: boxScore.status,
    statusText: boxScore.statusText,
    period: boxScore.period,
    regulationPeriods: boxScore.regulationPeriods,
    gameClock: boxScore.gameClock,
    startsAt: boxScore.startsAt,
    endedAt,
    homeTeam: toTeamSummary(boxScore.homeTeam),
    awayTeam: toTeamSummary(boxScore.awayTeam),
  };
}

function toTeamSummary({ teamId, tricode, city, name, score }: LiveTeamLine): LiveTeamSummary {
  return { teamId, tricode, city, name, score };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
