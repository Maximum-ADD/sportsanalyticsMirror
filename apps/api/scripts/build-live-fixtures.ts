// Builds a folder of live-feed fixtures, for developing and demoing the Live
// page when no NBA game is on (most of a South African day). It downloads
// real files for finished games, moves their times so they land in the
// page's Recent section as of now, and rewinds the first game to the middle
// of the third quarter, so the live view (clock, last five minutes of play)
// has something to show. The schedule it writes holds those games plus the
// real upcoming ones, with the soonest of those moved ten minutes into the
// past and given no box score, so Upcoming also shows a "Starting soon" game.
//
// Usage, from apps/api:
//   npm run live:fixtures                      (three games from 2026-10-06)
//   npm run live:fixtures -- <liveGameId> [finishedGameId...]
// Then start the API with LIVE_FEED_FIXTURES_DIR set to the folder printed.
// Set LIVE_FEED_FIXTURES_DIR before running this to choose the folder.
//
// The times are fixed when this runs, so re-run it once the window moves on
// (finished games drop off 18 hours after their moved end time). The rewound
// game's player stats are its final ones; only its score, clock and plays
// are rewound.

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeElapsedGameSeconds, parseIsoDurationInSeconds } from "../src/live/live-game-clock.js";

const NBA_CDN_ORIGIN = "https://cdn.nba.com";
// The CDN refuses /static/json requests without it (see live-feed-sources.ts).
const NBA_REFERER = "https://www.nba.com/";
const SCHEDULE_FILE_NAME = "scheduleLeagueV2.json";
const SCOREBOARD_FILE_NAME = "todaysScoreboard_00.json";
const DEFAULT_OUTPUT_DIRECTORY = join(tmpdir(), "nba-live-fixtures");
// Three preseason games from the night of 2026-10-05/06 (US time).
const DEFAULT_GAME_IDS = ["0012600028", "0012600024", "0012600022"];

// Where the live game is paused.
const LIVE_PERIOD = 3;
const LIVE_CLOCK = "PT05M30.00S";
const LIVE_STATUS_TEXT = "Q3 5:30";
const GAME_STATUS_LIVE = 2;

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
// The live game tipped off this long ago; finished games ended one, two,
// three... hours ago, in the order given.
const LIVE_GAME_STARTED_HOURS_AGO = 1.5;
// How far past its start time the "Starting soon" game is.
const STARTING_SOON_GAME_LATE_MINUTES = 10;
const NOT_POSTPONED = "N";

interface FeedAction {
  period: number;
  clock: string;
  timeActual: string;
  actionType: string;
  scoreHome: string;
  scoreAway: string;
}

interface FeedTeam {
  teamId: number;
  teamTricode: string;
  teamCity: string;
  teamName: string;
  score: number;
}

interface FeedBoxScore {
  game: {
    gameId: string;
    gameStatus: number;
    gameStatusText: string;
    period: number;
    gameClock: string;
    gameTimeUTC: string;
    homeTeam: FeedTeam;
    awayTeam: FeedTeam;
  };
}

interface FeedPlayByPlay {
  game: { actions: FeedAction[] };
}

interface FeedScheduleTeam {
  teamId: number;
  teamTricode: string | null;
  teamCity: string | null;
  teamName: string | null;
}

interface FeedScheduleGame {
  gameId: string;
  gameDateTimeUTC: string;
  gameStatus: number;
  gameStatusText: string;
  postponedStatus: string;
  homeTeam: FeedScheduleTeam;
  awayTeam: FeedScheduleTeam;
}

interface FixtureGame {
  boxScore: FeedBoxScore;
  playByPlay: FeedPlayByPlay;
}

async function main(): Promise<void> {
  const outputDirectory = process.env.LIVE_FEED_FIXTURES_DIR?.trim() || DEFAULT_OUTPUT_DIRECTORY;
  const [liveGameId, ...finishedGameIds] = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_GAME_IDS;
  const nowEpochMilliseconds = Date.now();

  const liveGame = rewindToMidGame(await downloadGame(liveGameId));
  moveStartTo(liveGame, nowEpochMilliseconds - LIVE_GAME_STARTED_HOURS_AGO * MILLISECONDS_PER_HOUR);

  const finishedGames: FixtureGame[] = [];
  for (const [index, gameId] of finishedGameIds.entries()) {
    const finishedGame = await downloadGame(gameId);
    moveEndTo(finishedGame, nowEpochMilliseconds - (index + 1) * MILLISECONDS_PER_HOUR);
    finishedGames.push(finishedGame);
  }

  const fixtureGames = [liveGame, ...finishedGames];
  const upcomingGames = await downloadUpcomingGames(nowEpochMilliseconds);
  const startingSoonGame = moveSoonestToStartingSoon(upcomingGames, nowEpochMilliseconds);
  await writeFixtures(outputDirectory, fixtureGames, upcomingGames);

  console.log(`Wrote ${fixtureGames.length} games (1 live, ${finishedGames.length} finished) to ${outputDirectory}`);
  if (startingSoonGame) {
    console.log(`Starting soon: ${startingSoonGame.awayTeam.teamTricode} @ ${startingSoonGame.homeTeam.teamTricode}`);
  }
  console.log(`Start the API with LIVE_FEED_FIXTURES_DIR=${outputDirectory} to serve them.`);
}

async function downloadFeedFile<T>(path: string): Promise<T> {
  const response = await fetch(`${NBA_CDN_ORIGIN}${path}`, { headers: { Referer: NBA_REFERER } });
  if (!response.ok) throw new Error(`${path}: status ${response.status} (is the game finished?)`);
  return (await response.json()) as T;
}

async function downloadGame(gameId: string): Promise<FixtureGame> {
  const [boxScore, playByPlay] = await Promise.all([
    downloadFeedFile<FeedBoxScore>(`/static/json/liveData/boxscore/boxscore_${gameId}.json`),
    downloadFeedFile<FeedPlayByPlay>(`/static/json/liveData/playbyplay/playbyplay_${gameId}.json`),
  ]);
  return { boxScore, playByPlay };
}

// The real schedule's games that haven't started yet, so the page's "next
// tip-off" stays true in fixture mode.
async function downloadUpcomingGames(nowEpochMilliseconds: number): Promise<FeedScheduleGame[]> {
  const schedule = await downloadFeedFile<{ leagueSchedule: { gameDates: { games: FeedScheduleGame[] }[] } }>(
    `/static/json/staticData/${SCHEDULE_FILE_NAME}`
  );
  return schedule.leagueSchedule.gameDates
    .flatMap((gameDate) => gameDate.games)
    .filter((game) => Date.parse(game.gameDateTimeUTC) > nowEpochMilliseconds);
}

/**
 * Turns a finished game back into a live one, paused at LIVE_PERIOD /
 * LIVE_CLOCK: later plays (the final buzzer included) are dropped, and the
 * score is the one standing at that moment.
 */
function rewindToMidGame(game: FixtureGame): FixtureGame {
  const pausedAtElapsedSeconds = computeElapsedGameSeconds(LIVE_PERIOD, parseIsoDurationInSeconds(LIVE_CLOCK) ?? 0);
  const actionsSoFar = game.playByPlay.game.actions.filter((action) => {
    const secondsLeft = parseIsoDurationInSeconds(action.clock);
    return secondsLeft !== null && computeElapsedGameSeconds(action.period, secondsLeft) <= pausedAtElapsedSeconds;
  });
  const latestAction = actionsSoFar.at(-1);
  if (!latestAction) throw new Error(`Game ${game.boxScore.game.gameId} has no plays before ${LIVE_STATUS_TEXT}`);

  const boxScoreGame = game.boxScore.game;
  boxScoreGame.gameStatus = GAME_STATUS_LIVE;
  boxScoreGame.gameStatusText = LIVE_STATUS_TEXT;
  boxScoreGame.period = LIVE_PERIOD;
  boxScoreGame.gameClock = LIVE_CLOCK;
  boxScoreGame.homeTeam.score = Number(latestAction.scoreHome);
  boxScoreGame.awayTeam.score = Number(latestAction.scoreAway);
  game.playByPlay.game.actions = actionsSoFar;
  return game;
}

// Puts the soonest real upcoming game ten minutes past its start time. With
// no box score saved for it, the page shows it as "Starting soon": the gap
// between a game's scheduled start and the NBA publishing its box score.
function moveSoonestToStartingSoon(upcomingGames: FeedScheduleGame[], nowEpochMilliseconds: number): FeedScheduleGame | null {
  const [soonestGame] = [...upcomingGames].sort((first, second) => Date.parse(first.gameDateTimeUTC) - Date.parse(second.gameDateTimeUTC));
  if (!soonestGame) return null;
  const lateStartEpochMilliseconds = nowEpochMilliseconds - STARTING_SOON_GAME_LATE_MINUTES * MILLISECONDS_PER_MINUTE;
  soonestGame.gameDateTimeUTC = new Date(lateStartEpochMilliseconds).toISOString().replace(/\.\d{3}Z$/, "Z");
  return soonestGame;
}

function moveStartTo(game: FixtureGame, startEpochMilliseconds: number): void {
  shiftGameTimes(game, startEpochMilliseconds - Date.parse(game.boxScore.game.gameTimeUTC));
}

function moveEndTo(game: FixtureGame, endEpochMilliseconds: number): void {
  const lastAction = game.playByPlay.game.actions.at(-1);
  if (!lastAction) throw new Error(`Game ${game.boxScore.game.gameId} has no plays`);
  shiftGameTimes(game, endEpochMilliseconds - Date.parse(lastAction.timeActual));
}

// Moves the scheduled start and every play's wall-clock time by the same
// amount, so the game's length and end time stay true to the real one.
function shiftGameTimes(game: FixtureGame, shiftInMilliseconds: number): void {
  const shift = (timestamp: string) => new Date(Date.parse(timestamp) + shiftInMilliseconds).toISOString();
  game.boxScore.game.gameTimeUTC = shift(game.boxScore.game.gameTimeUTC).replace(/\.\d{3}Z$/, "Z");
  for (const action of game.playByPlay.game.actions) action.timeActual = shift(action.timeActual);
}

// The schedule entry for a fixture game, built from its box score. Its status
// matches the box score's, though the page only ever takes state from the
// box score itself.
function toScheduleGame({ boxScore }: FixtureGame): FeedScheduleGame {
  const { gameId, gameTimeUTC, gameStatus, gameStatusText, homeTeam, awayTeam } = boxScore.game;
  return {
    gameId,
    gameDateTimeUTC: gameTimeUTC,
    gameStatus,
    gameStatusText,
    postponedStatus: NOT_POSTPONED,
    homeTeam: toScheduleTeam(homeTeam),
    awayTeam: toScheduleTeam(awayTeam),
  };
}

function toScheduleTeam({ teamId, teamTricode, teamCity, teamName }: FeedTeam): FeedScheduleTeam {
  return { teamId, teamTricode, teamCity, teamName };
}

async function writeFixtures(outputDirectory: string, fixtureGames: FixtureGame[], upcomingGames: FeedScheduleGame[]): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  const writeJson = (fileName: string, value: unknown) => writeFile(join(outputDirectory, fileName), JSON.stringify(value));

  const schedule = { leagueSchedule: { gameDates: [{ games: [...fixtureGames.map(toScheduleGame), ...upcomingGames] }] } };
  await writeJson(SCHEDULE_FILE_NAME, schedule);
  await writeJson(SCOREBOARD_FILE_NAME, { scoreboard: { games: [] } });
  for (const { boxScore, playByPlay } of fixtureGames) {
    await writeJson(`boxscore_${boxScore.game.gameId}.json`, boxScore);
    await writeJson(`playbyplay_${boxScore.game.gameId}.json`, playByPlay);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
