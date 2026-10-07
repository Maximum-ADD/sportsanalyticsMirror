// Game-time arithmetic for the NBA's live feed. The feed writes every clock as
// an ISO 8601 duration of the time LEFT in the period ("PT04M12.00S" is 4:12
// to play); these helpers turn that into seconds, and into one running count
// of game time played, which is what the play-by-play window is measured in.

const SECONDS_PER_MINUTE = 60;
const REGULATION_PERIOD_COUNT = 4;
const REGULATION_PERIOD_LENGTH_IN_SECONDS = 12 * SECONDS_PER_MINUTE;
const OVERTIME_PERIOD_LENGTH_IN_SECONDS = 5 * SECONDS_PER_MINUTE;

// How much game time the live play-by-play view covers.
export const RECENT_PLAY_WINDOW_IN_SECONDS = 5 * SECONDS_PER_MINUTE;

// Minutes and seconds are each optional in ISO 8601, so "PT45S" and "PT12M"
// are valid too. The feed always sends both, with hundredths ("PT00M38.10S").
const ISO_DURATION_PATTERN = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/;

/** The parts of a play this module needs to place it in game time. */
export interface TimedPlay {
  period: number;
  clock: string;
  orderNumber: number;
}

/**
 * Converts an ISO 8601 duration such as "PT04M12.00S" into seconds (252).
 *
 * @param duration - the feed's clock or minutes-played text.
 * @returns the duration in seconds, or null when the text is empty (the feed
 *   sends "" between periods) or not an ISO duration at all.
 */
export function parseIsoDurationInSeconds(duration: string): number | null {
  const match = ISO_DURATION_PATTERN.exec(duration);
  if (!match) return null;
  const [, minutesText, secondsText] = match;
  if (minutesText === undefined && secondsText === undefined) return null;
  return Number(minutesText ?? 0) * SECONDS_PER_MINUTE + Number(secondsText ?? 0);
}

/**
 * How long a period lasts: 12-minute quarters, then 5-minute overtimes.
 *
 * @param period - 1-4 for the quarters, 5 for the first overtime, and so on.
 */
export function getPeriodLengthInSeconds(period: number): number {
  return period <= REGULATION_PERIOD_COUNT ? REGULATION_PERIOD_LENGTH_IN_SECONDS : OVERTIME_PERIOD_LENGTH_IN_SECONDS;
}

/**
 * Converts a (period, time left) pair into seconds of game time played since
 * tip-off, so moments in different periods can be compared directly.
 *
 * @param period - the period the moment falls in (1-based).
 * @param secondsLeftInPeriod - the game clock at that moment.
 * @returns e.g. 1560 for Q3 with 10:00 left (two full quarters plus two minutes).
 */
export function computeElapsedGameSeconds(period: number, secondsLeftInPeriod: number): number {
  let secondsBeforePeriod = 0;
  for (let earlierPeriod = 1; earlierPeriod < period; earlierPeriod++) {
    secondsBeforePeriod += getPeriodLengthInSeconds(earlierPeriod);
  }
  return secondsBeforePeriod + getPeriodLengthInSeconds(period) - secondsLeftInPeriod;
}

/**
 * Picks the plays from the last few minutes of game time, most recent first.
 *
 * The window runs back from the latest play in the list, crossing period
 * breaks: two minutes into Q3 it also holds the last three minutes of Q2.
 * "Now" is that latest play rather than the box score's clock, because the
 * box score and play-by-play are separate files fetched and cached apart.
 * Measuring within one file keeps the window consistent with the plays it
 * filters.
 *
 * @param plays - every play in the game, in any order.
 * @param windowInSeconds - how much game time to keep (five minutes by default).
 * @returns the plays inside the window, latest first; plays at the same clock
 *   (a foul and its free throws) keep the feed's own order, reversed. A play
 *   whose clock can't be parsed is left out, since it can't be placed in time.
 */
export function selectRecentPlays<T extends TimedPlay>(plays: T[], windowInSeconds = RECENT_PLAY_WINDOW_IN_SECONDS): T[] {
  const timedPlays = plays.flatMap((play) => {
    const secondsLeftInPeriod = parseIsoDurationInSeconds(play.clock);
    return secondsLeftInPeriod === null
      ? []
      : [{ play, elapsedSeconds: computeElapsedGameSeconds(play.period, secondsLeftInPeriod) }];
  });
  if (timedPlays.length === 0) return [];

  const latestElapsedSeconds = Math.max(...timedPlays.map((timedPlay) => timedPlay.elapsedSeconds));
  return timedPlays
    .filter((timedPlay) => timedPlay.elapsedSeconds > latestElapsedSeconds - windowInSeconds)
    .sort((first, second) => second.elapsedSeconds - first.elapsedSeconds || second.play.orderNumber - first.play.orderNumber)
    .map((timedPlay) => timedPlay.play);
}
