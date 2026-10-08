import type { LiveGameDetail, LiveGameSummary, LivePlay, LivePlayerLine, UpcomingLiveGame } from "@/lib/liveGamesApi";

// Shared test data for the live pages, shaped like the API's responses and
// based on a real preseason game (LAL @ SAC, 2026-10-06).

export function buildLiveGameSummary(overrides: Partial<LiveGameSummary> = {}): LiveGameSummary {
  return {
    gameId: "0012600028",
    seasonType: "Preseason",
    status: "live",
    statusText: "Q3 4:12",
    period: 3,
    regulationPeriods: 4,
    gameClock: "PT04M12.00S",
    startsAt: "2026-10-06T02:00:00Z",
    endedAt: null,
    homeTeam: { teamId: 1610612758, tricode: "SAC", city: "Sacramento", name: "Kings", score: 70 },
    awayTeam: { teamId: 1610612747, tricode: "LAL", city: "Los Angeles", name: "Lakers", score: 68 },
    ...overrides,
  };
}

// BKN @ CHA, the first game of the night after (01:00 SAST on Wed 7 Oct).
export function buildUpcomingGame(overrides: Partial<UpcomingLiveGame> = {}): UpcomingLiveGame {
  return {
    gameId: "0012600025",
    seasonType: "Preseason",
    startsAt: "2026-10-06T23:00:00Z",
    statusNote: null,
    homeTeam: { teamId: 1610612766, tricode: "CHA", city: "Charlotte", name: "Hornets" },
    awayTeam: { teamId: 1610612751, tricode: "BKN", city: "Brooklyn", name: "Nets" },
    ...overrides,
  };
}

export function buildLivePlayerLine(overrides: Partial<LivePlayerLine> = {}): LivePlayerLine {
  return {
    personId: 1629631,
    name: "De'Andre Hunter",
    shortName: "D. Hunter",
    jerseyNumber: "15",
    position: "SF",
    isStarter: true,
    hasPlayed: true,
    minutes: "PT13M27.00S",
    points: 3,
    assists: 0,
    rebounds: 0,
    turnovers: 0,
    steals: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 3,
    freeThrowsAttempted: 3,
    plusMinus: -16,
    ...overrides,
  };
}

export function buildLivePlay(overrides: Partial<LivePlay> = {}): LivePlay {
  return {
    actionNumber: 786,
    orderNumber: 510350351,
    period: 3,
    clock: "PT04M12.00S",
    teamTricode: "SAC",
    description: "N. Clifford 7' putback Layup (23 PTS)",
    homeScore: 70,
    awayScore: 68,
    isScoringPlay: true,
    ...overrides,
  };
}

export function buildLiveGameDetail(overrides: Partial<LiveGameDetail> = {}): LiveGameDetail {
  return {
    game: buildLiveGameSummary(),
    homePlayers: [buildLivePlayerLine()],
    awayPlayers: [
      buildLivePlayerLine({ personId: 1629680, name: "Matisse Thybulle", shortName: "M. Thybulle", points: 6, plusMinus: 3 }),
    ],
    recentPlays: [buildLivePlay()],
    ...overrides,
  };
}
