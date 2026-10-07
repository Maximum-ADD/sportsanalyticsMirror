import { formatGameClock } from "./gameClock";
import type { LiveGameSummary, LiveGamesBoard, UpcomingLiveGame } from "./liveGamesApi";

// How the live page words and times a game.
//
// Times always show in South African time, whatever the viewer's own zone:
// the page is built for South African viewers following games that are
// played overnight their time (roughly 01:00 to 07:00), and a fixed,
// labelled zone reads the same on every device. "Today" means today in
// South Africa too, for the same reason.
const SOUTH_AFRICA_TIME_ZONE = "Africa/Johannesburg";
export const SOUTH_AFRICA_TIME_ZONE_LABEL = "SAST";

// How often the page asks for fresh data. While a game is live or about to
// tip off, a little slower than the API refreshes it (every 10-15 seconds),
// so most requests get something new. Otherwise only often enough to keep
// the sections current.
export const LIVE_REFRESH_INTERVAL_IN_MILLISECONDS = 15_000;
export const IDLE_REFRESH_INTERVAL_IN_MILLISECONDS = 60_000;

export const STARTING_SOON_LABEL = "Starting soon";

// A clock stopped at zero means the period is over, and the NBA's own status
// text ("Half", "End of 3rd") says more than "Q2 · 0:00" would.
const PERIOD_OVER_CLOCK = "0:00";
const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

// "Wed 7 Oct" and "01:00". en-GB because en-ZA writes "Wed, 07 Oct".
const southAfricanDateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: SOUTH_AFRICA_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const southAfricanTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: SOUTH_AFRICA_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const southAfricanClockTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: SOUTH_AFRICA_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// "2026-10-07": a calendar day in South Africa, comparable as a string.
const southAfricanDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: SOUTH_AFRICA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Names a period: "Q1" to "Q4", then "OT", "2OT" and so on.
 *
 * @param period - the 1-based period number from the feed.
 * @param regulationPeriods - how many periods regulation has (four in the NBA).
 */
export function describePeriod(period: number, regulationPeriods: number): string {
  if (period <= regulationPeriods) return `Q${period}`;
  const overtimeNumber = period - regulationPeriods;
  return overtimeNumber === 1 ? "OT" : `${overtimeNumber}OT`;
}

/**
 * How a finished game ended: "Final", or "Final/OT", "Final/2OT" and so on
 * for one decided in overtime.
 *
 * @param period - the game's last period.
 * @param regulationPeriods - how many periods regulation has.
 */
export function describeFinish(period: number, regulationPeriods: number): string {
  return period <= regulationPeriods ? "Final" : `Final/${describePeriod(period, regulationPeriods)}`;
}

/**
 * Where a live game stands: "Q3 · 4:12". Between periods (no clock, or one
 * stopped at zero) it falls back to the NBA's own status text, e.g. "Half".
 */
export function describeLiveState(game: Pick<LiveGameSummary, "period" | "regulationPeriods" | "gameClock" | "statusText">): string {
  const periodLabel = describePeriod(game.period, game.regulationPeriods);
  const displayedClock = game.gameClock ? formatGameClock(game.gameClock) : null;
  if (!displayedClock || displayedClock === PERIOD_OVER_CLOCK) return game.statusText || periodLabel;
  return `${periodLabel} · ${displayedClock}`;
}

/**
 * A moment in South African time: "04:00" when it falls on today's date
 * there, or "Wed 7 Oct 01:00" when it doesn't. The Upcoming section can
 * reach into a second night of games, so the day matters.
 *
 * @param timestamp - a UTC ISO 8601 timestamp from the API.
 * @param nowEpochMilliseconds - the current time, which decides what "today" is.
 */
export function formatSouthAfricanTime(timestamp: string, nowEpochMilliseconds: number): string {
  const moment = new Date(timestamp);
  const timeText = southAfricanTimeFormat.format(moment);
  const isToday = southAfricanDayFormat.format(moment) === southAfricanDayFormat.format(new Date(nowEpochMilliseconds));
  return isToday ? timeText : `${southAfricanDateFormat.format(moment)} ${timeText}`;
}

/**
 * A moment as a 24-hour clock time with seconds in South African time:
 * "20:45:12". For "last updated" notes, where the day goes without saying.
 *
 * @param epochMilliseconds - e.g. React Query's dataUpdatedAt.
 */
export function formatSouthAfricanClockTime(epochMilliseconds: number): string {
  return southAfricanClockTimeFormat.format(new Date(epochMilliseconds));
}

/**
 * A live or finished game's times in one line: "Start 04:00 · End 06:42 SAST",
 * or just the start while it's live. The start is the scheduled tip-off.
 */
export function describeGameTimes(game: Pick<LiveGameSummary, "startsAt" | "endedAt">, nowEpochMilliseconds: number): string {
  const startText = `Start ${formatSouthAfricanTime(game.startsAt, nowEpochMilliseconds)}`;
  const endText = game.endedAt ? ` · End ${formatSouthAfricanTime(game.endedAt, nowEpochMilliseconds)}` : "";
  return `${startText}${endText} ${SOUTH_AFRICA_TIME_ZONE_LABEL}`;
}

/**
 * Time until tip-off: "in 3h 20m", "in 3h", "in 45m". Rounds up to the
 * minute, so the last minute reads "in 1m" rather than "in 0m".
 *
 * @returns null once the start time has passed.
 */
export function formatCountdown(startsAt: string, nowEpochMilliseconds: number): string | null {
  const millisecondsToStart = Date.parse(startsAt) - nowEpochMilliseconds;
  if (millisecondsToStart <= 0) return null;

  const minutesToStart = Math.ceil(millisecondsToStart / MILLISECONDS_PER_MINUTE);
  const hours = Math.floor(minutesToStart / MINUTES_PER_HOUR);
  const minutes = minutesToStart % MINUTES_PER_HOUR;
  if (hours === 0) return `in ${minutes}m`;
  return minutes === 0 ? `in ${hours}h` : `in ${hours}h ${minutes}m`;
}

/**
 * What an upcoming game's card says about its start: the NBA's own note when
 * the game is off track ("PPD", "TBD"), otherwise the countdown, then
 * "Starting soon" once the start time passes and the box score hasn't
 * appeared yet (games often tip off a few minutes late).
 */
export function describeUpcomingState(game: Pick<UpcomingLiveGame, "startsAt" | "statusNote">, nowEpochMilliseconds: number): string {
  return game.statusNote ?? formatCountdown(game.startsAt, nowEpochMilliseconds) ?? STARTING_SOON_LABEL;
}

/** Made and attempted, as a box score shows them: "4-7". */
export function formatShootingSplit(made: number, attempted: number): string {
  return `${made}-${attempted}`;
}

/** A plus/minus with its sign: "+9", "-6", or "0". */
export function formatPlusMinus(plusMinus: number): string {
  return plusMinus > 0 ? `+${plusMinus}` : String(plusMinus);
}

/**
 * Whether the board can change at any moment, which decides how often the
 * page refreshes: a game is in progress, or one is past its start time and
 * could tip off (and move to Live) on the next check. A game carrying a
 * note such as "PPD" isn't about to tip off, so it doesn't count.
 */
export function shouldRefreshOften(board: LiveGamesBoard | undefined, nowEpochMilliseconds: number): boolean {
  if (!board) return false;
  const isGameDueToTipOff = board.upcoming.some(
    (game) => game.statusNote === null && Date.parse(game.startsAt) <= nowEpochMilliseconds
  );
  return board.live.length > 0 || isGameDueToTipOff;
}
