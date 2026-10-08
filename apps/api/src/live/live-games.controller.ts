import { Controller, Get, HttpStatus, Param } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ApiException } from "../common/api-exception.js";
import { LiveFeedUnavailableError } from "./live-feed-unavailable.error.js";
import { LiveGamesService, type LiveGameDetail, type LiveGamesBoard } from "./live-games.service.js";

const NOT_ON_THE_BOARD_MESSAGE = "This game is not live and did not finish in the last 18 hours";

// Public, and deliberately without the OptionalSessionGuard + ApiKeyGuard
// pair the other public read controllers use. Both read the database on
// every request, and ApiKeyGuard also writes a usage row, so a page that
// polls every 15 seconds would become steady database traffic for data that
// never touches the database. Signed-out visitors also share the site
// proxy's one API key (100 requests a minute, 10,000 a day by default); a
// handful of viewers polling would use that up for every page on the site.
//
// What's left to protect is the NBA's CDN, and LiveGamesService bounds that
// itself: every response is built from shared cached reads, and only games
// on the schedule are ever read, so a caller can't steer requests anywhere.
@ApiTags("live")
@Controller("v1/live/games")
export class LiveGamesController {
  constructor(private readonly liveGamesService: LiveGamesService) {}

  // GET /v1/live/games: the live page's three sections, straight from the
  // NBA's live feed (preseason included): games in progress, games starting
  // within 24 hours, and games that finished within 18 hours.
  @Get()
  @ApiOperation({ summary: "List live, upcoming (next 24 h) and recent (last 18 h) NBA games (NBA-provided stats)" })
  @ApiResponse({ status: 200, description: "The live, upcoming and recent sections" })
  @ApiResponse({ status: 503, description: "The NBA's live feed is unavailable" })
  listLiveGames(): Promise<LiveGamesBoard> {
    return readLiveFeed(() => this.liveGamesService.getLiveGames());
  }

  // GET /v1/live/games/:gameId: one live or recent game's box score, plus its
  // last five minutes of play while it's live. Upcoming games have no box
  // score yet, so they 404 like any game off the board.
  @Get(":gameId")
  @ApiOperation({ summary: "Get a live or recently finished game's box score and recent plays" })
  @ApiParam({ name: "gameId", description: "The NBA's ten-digit game id, e.g. 0012600028" })
  @ApiResponse({ status: 200, description: "Box score, and recent plays while the game is live" })
  @ApiResponse({ status: 404, description: NOT_ON_THE_BOARD_MESSAGE })
  @ApiResponse({ status: 503, description: "The NBA's live feed is unavailable" })
  async getLiveGame(@Param("gameId") gameId: string): Promise<LiveGameDetail> {
    const detail = await readLiveFeed(() => this.liveGamesService.getLiveGame(gameId));
    if (!detail) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", NOT_ON_THE_BOARD_MESSAGE);
    return detail;
  }
}

/**
 * Runs a live-feed read, reporting a feed outage in the API's error envelope.
 *
 * @param read - the service call to run.
 * @returns whatever the read returns.
 * @throws ApiException 503 LIVE_DATA_UNAVAILABLE when the NBA's feed can't be
 *   read or has changed shape; any other error passes through unchanged.
 */
async function readLiveFeed<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof LiveFeedUnavailableError)) throw error;
    throw new ApiException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "LIVE_DATA_UNAVAILABLE",
      `Live NBA data is unavailable right now. ${error.message}`
    );
  }
}
