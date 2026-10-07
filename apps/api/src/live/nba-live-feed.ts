import { Inject, Injectable } from "@nestjs/common";
import { LIVE_FEED_SOURCE, type LiveFeedSource } from "./live-feed-sources.js";
import { LiveFeedUnavailableError } from "./live-feed-unavailable.error.js";
import {
  parseBoxScore,
  parsePlayByPlay,
  parseSchedule,
  parseScoreboard,
  type LiveBoxScore,
  type LivePlayByPlay,
  type ScheduledGame,
} from "./nba-live-feed-parsers.js";

// The same files NBA.com's own gamecast pages and nba_api.live read. Game ids
// are ten digits, so they can't smuggle a path segment into these.
const SCHEDULE_PATH = "/static/json/staticData/scheduleLeagueV2.json";
const SCOREBOARD_PATH = "/static/json/liveData/scoreboard/todaysScoreboard_00.json";

function buildBoxScorePath(gameId: string): string {
  return `/static/json/liveData/boxscore/boxscore_${gameId}.json`;
}

function buildPlayByPlayPath(gameId: string): string {
  return `/static/json/liveData/playbyplay/playbyplay_${gameId}.json`;
}

/**
 * The NBA's live feed, read and validated: one method per feed file, each
 * returning this module's own shapes (see nba-live-feed-parsers.ts). Nothing
 * here caches; LiveGamesService decides how long each answer is kept.
 */
@Injectable()
export class NbaLiveFeed {
  constructor(@Inject(LIVE_FEED_SOURCE) private readonly source: LiveFeedSource) {}

  /** Every game in the current season's schedule, preseason included. */
  async getSchedule(): Promise<ScheduledGame[]> {
    return parseSchedule(await this.readPublishedJson(SCHEDULE_PATH));
  }

  /** The games on the current NBA day (US Eastern), which rolls over in the US morning. */
  async getScoreboard(): Promise<ScheduledGame[]> {
    return parseScoreboard(await this.readPublishedJson(SCOREBOARD_PATH));
  }

  /** One game's box score, or null until it tips off. */
  async getBoxScore(gameId: string): Promise<LiveBoxScore | null> {
    const payload = await this.source.readJson(buildBoxScorePath(gameId));
    return payload === null ? null : parseBoxScore(payload);
  }

  /** One game's play-by-play, or null until it tips off. */
  async getPlayByPlay(gameId: string): Promise<LivePlayByPlay | null> {
    const payload = await this.source.readJson(buildPlayByPlayPath(gameId));
    return payload === null ? null : parsePlayByPlay(payload);
  }

  // The schedule and scoreboard always exist, so a missing one is an outage.
  private async readPublishedJson(path: string): Promise<unknown> {
    const payload = await this.source.readJson(path);
    if (payload === null) throw new LiveFeedUnavailableError(`The NBA CDN has no ${path}`);
    return payload;
  }
}
