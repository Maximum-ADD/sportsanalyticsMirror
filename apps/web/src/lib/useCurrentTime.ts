import { useEffect, useState } from "react";

/**
 * The current time (epoch milliseconds), re-read every `intervalInMilliseconds`,
 * for anything on screen that depends on the clock rather than on data:
 * countdowns, "Starting soon", and which day counts as today.
 *
 * @param intervalInMilliseconds - how stale the value may get. Countdowns
 *   that show whole minutes only need it every half minute or so.
 */
export function useCurrentTime(intervalInMilliseconds: number): number {
  const [nowEpochMilliseconds, setNowEpochMilliseconds] = useState(() => Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => setNowEpochMilliseconds(Date.now()), intervalInMilliseconds);
    return () => window.clearInterval(timerId);
  }, [intervalInMilliseconds]);

  return nowEpochMilliseconds;
}
