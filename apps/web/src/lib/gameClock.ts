// Game clocks are stored as ISO durations ("PT11M30.00S", NBA's own form);
// games ingested before real play-by-play use "11:30". Admins read and type
// "m:ss" (or "m:ss.s" in a period's last minute), and a typed clock is saved
// back in the ISO form.

const ISO_CLOCK_PATTERN = /^PT(\d{1,2})M(\d{1,2})(?:\.(\d{1,2}))?S$/;
const LEGACY_CLOCK_PATTERN = /^(\d{1,2}):(\d{2})$/;
const TYPED_CLOCK_PATTERN = /^(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?$/;

const SECONDS_PER_MINUTE = 60;
const MAX_PERIOD_MINUTES = 12;

/** Pads to two digits: 4 -> "04". */
function padTwoDigits(value: number | string): string {
  return String(value).padStart(2, "0");
}

/**
 * A stored clock as "m:ss", keeping a non-zero fraction ("0:04.5"). Returns
 * the stored text unchanged when it's in neither known form, so nothing is
 * ever hidden from the admin.
 */
export function formatGameClock(storedClock: string): string {
  const isoMatch = ISO_CLOCK_PATTERN.exec(storedClock);
  if (isoMatch) {
    const [, minutes, seconds, fraction = ""] = isoMatch;
    const trimmedFraction = fraction.replace(/0+$/, "");
    return `${Number(minutes)}:${padTwoDigits(seconds)}${trimmedFraction ? `.${trimmedFraction}` : ""}`;
  }
  const legacyMatch = LEGACY_CLOCK_PATTERN.exec(storedClock);
  return legacyMatch ? `${Number(legacyMatch[1])}:${legacyMatch[2]}` : storedClock;
}

/**
 * A typed "m:ss" / "m:ss.s" clock as the stored ISO form ("PT11M30.00S"),
 * or null when it isn't a valid time left in a period (at most 12:00).
 */
export function parseTypedGameClock(typedClock: string): string | null {
  const match = TYPED_CLOCK_PATTERN.exec(typedClock.trim());
  if (!match) return null;
  const [, minutesText, secondsText, fraction = ""] = match;
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);
  const hundredths = fraction.padEnd(2, "0");
  if (seconds >= SECONDS_PER_MINUTE) return null;
  if (minutes > MAX_PERIOD_MINUTES || (minutes === MAX_PERIOD_MINUTES && (seconds > 0 || Number(hundredths) > 0))) {
    return null;
  }
  return `PT${padTwoDigits(minutes)}M${padTwoDigits(seconds)}.${hundredths}S`;
}
