import { formatSouthAfricanClockTime, SOUTH_AFRICA_TIME_ZONE_LABEL } from "@/lib/liveGameDisplay";

const MILLISECONDS_PER_SECOND = 1000;

interface LiveRefreshNoteProps {
  /** When the data on screen was fetched (React Query's dataUpdatedAt). */
  updatedAtEpochMilliseconds: number;
  /** Whether the latest background refresh failed, leaving older data on screen. */
  hasRefreshFailed: boolean;
  /** How often the page refreshes right now, or false when it doesn't. */
  refreshIntervalInMilliseconds: number | false;
}

/**
 * Says how fresh the live data is. A failed background refresh keeps the
 * last good data on screen rather than blanking the page, so this is where
 * that shows: the page then says which moment its figures are from.
 */
export function LiveRefreshNote({ updatedAtEpochMilliseconds, hasRefreshFailed, refreshIntervalInMilliseconds }: LiveRefreshNoteProps) {
  const updatedTime = `${formatSouthAfricanClockTime(updatedAtEpochMilliseconds)} ${SOUTH_AFRICA_TIME_ZONE_LABEL}`;

  if (hasRefreshFailed) {
    return (
      <p role="status" className="font-mono text-[10px] tracking-[0.08em] text-yellow-800 uppercase">
        Couldn't refresh the live data. Showing it as of {updatedTime}.
      </p>
    );
  }

  const cadenceText = refreshIntervalInMilliseconds
    ? ` · Refreshes every ${refreshIntervalInMilliseconds / MILLISECONDS_PER_SECOND} seconds`
    : "";
  return (
    <p className="font-mono text-[10px] tracking-[0.08em] text-locker-ink-muted uppercase">
      Updated {updatedTime}
      {cadenceText}
    </p>
  );
}
