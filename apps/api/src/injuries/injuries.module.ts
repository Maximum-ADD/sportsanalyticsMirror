import { Logger, Module } from "@nestjs/common";
import { ResponseCacheService } from "../cache/response-cache.service.js";
import { EspnInjuryFeedSource, FixtureInjuryFeedSource, INJURY_FEED_SOURCE, type InjuryFeedSource } from "./injury-feed-sources.js";
import { InjuriesController } from "./injuries.controller.js";
import { INJURY_REPORT_CACHE, InjuriesService } from "./injuries.service.js";

// Injuries and expected return dates, read live from ESPN's injury report.
// Keeps nothing: no tables, no rows, only an in-memory cache.

// One entry: the matched league report every read is cut from.
const INJURY_REPORT_CACHE_MAX_ENTRIES = 1;

// INJURY_FEED_FIXTURE_PATH points the module at a saved copy of ESPN's report
// instead of ESPN, for working offline or when ESPN is unreachable.
// src/injuries/fixtures/espn-injuries.json is a small real one. Leave it
// unset in production.
function createInjuryFeedSource(): InjuryFeedSource {
  const fixturePath = process.env.INJURY_FEED_FIXTURE_PATH?.trim();
  if (!fixturePath) return new EspnInjuryFeedSource();

  new Logger(InjuriesModule.name).warn(`Injuries are being served from ${fixturePath}, not ESPN`);
  return new FixtureInjuryFeedSource(fixturePath);
}

// Its own cache rather than the global ResponseCacheService, as the live
// games module does: it is what keeps requests to ESPN at about one per half
// hour, so it must stay on where the global one is turned off (under Vitest
// and with API_CACHE_DISABLED, which exist for database staleness).
function createInjuryReportCache(): ResponseCacheService {
  return new ResponseCacheService({ enabled: true, maxEntries: INJURY_REPORT_CACHE_MAX_ENTRIES });
}

@Module({
  controllers: [InjuriesController],
  providers: [
    InjuriesService,
    { provide: INJURY_FEED_SOURCE, useFactory: createInjuryFeedSource },
    { provide: INJURY_REPORT_CACHE, useFactory: createInjuryReportCache },
  ],
})
export class InjuriesModule {}
