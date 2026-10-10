import { Logger, Module } from "@nestjs/common";
import { ResponseCacheService } from "../cache/response-cache.service.js";
import { CdnLiveFeedSource, FixtureLiveFeedSource, LIVE_FEED_SOURCE, type LiveFeedSource } from "./live-feed-sources.js";
import { LiveGamesController } from "./live-games.controller.js";
import { LIVE_FEED_CACHE, LiveGamesService } from "./live-games.service.js";
import { NbaLiveFeed } from "./nba-live-feed.js";

// The live games page: a bonus feature outside the platform's core scope.
// It shows NBA-provided stats for live and recent games, preseason included,
// and keeps nothing: no tables, no rows, only an in-memory cache.

// Every game in the 22-hour candidate window (a snapshot, an end time and a
// slice of plays each) over several nights, plus the schedule and scoreboard.
const LIVE_FEED_CACHE_MAX_ENTRIES = 200;

// LIVE_FEED_FIXTURES_DIR points the module at a folder of saved feed files
// instead of the CDN, for building and demoing the page when no game is on.
// `npm run live:fixtures` (scripts/build-live-fixtures.ts) makes one. Leave it
// unset in production.
function createLiveFeedSource(): LiveFeedSource {
  const fixturesDirectory = process.env.LIVE_FEED_FIXTURES_DIR?.trim();
  if (!fixturesDirectory) return new CdnLiveFeedSource();

  new Logger(LiveGamesModule.name).warn(`Live games are being served from fixtures in ${fixturesDirectory}, not the NBA's feed`);
  return new FixtureLiveFeedSource(fixturesDirectory);
}

// Its own cache rather than the global ResponseCacheService, for two reasons.
// Here the cache is what keeps traffic to the NBA flat as viewers grow, so it
// must stay on where the global one is turned off (under Vitest, and with
// API_CACHE_DISABLED, which both exist for database staleness). And database
// reads filling that shared cache shouldn't evict the 5 MB schedule.
function createLiveFeedCache(): ResponseCacheService {
  return new ResponseCacheService({ enabled: true, maxEntries: LIVE_FEED_CACHE_MAX_ENTRIES });
}

@Module({
  controllers: [LiveGamesController],
  providers: [
    NbaLiveFeed,
    LiveGamesService,
    { provide: LIVE_FEED_SOURCE, useFactory: createLiveFeedSource },
    { provide: LIVE_FEED_CACHE, useFactory: createLiveFeedCache },
  ],
})
export class LiveGamesModule {}
