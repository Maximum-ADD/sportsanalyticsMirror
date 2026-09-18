import type { IngestionPullRequest, IngestionRequestStatus } from "./adminApi";

export const PULL_REQUESTS_QUERY_KEY = ["ingestionRequests"];

// A worker checks in every minute, and every minute while a pull runs. Three
// missed check-ins is long enough to rule out a slow network, short enough
// that an admin isn't left thinking a stopped worker will pick things up.
const WORKER_ONLINE_WITHIN_MINUTES = 3;
const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_SHOWN_BEFORE_DAYS = 48;
const HOURS_PER_DAY = 24;

/** Whether a request still needs watching — waiting for, or on, a worker. */
export function isActivePullRequest(status: IngestionRequestStatus): boolean {
  return status === "QUEUED" || status === "RUNNING";
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function describeElapsed(sinceIso: string, nowInMilliseconds: number): string {
  const elapsedInMinutes = Math.max(0, Math.round((nowInMilliseconds - Date.parse(sinceIso)) / MILLISECONDS_PER_MINUTE));
  if (elapsedInMinutes < 1) return "just now";
  if (elapsedInMinutes < MINUTES_PER_HOUR) return `${elapsedInMinutes} minute${elapsedInMinutes === 1 ? "" : "s"} ago`;
  const elapsedInHours = Math.round(elapsedInMinutes / MINUTES_PER_HOUR);
  if (elapsedInHours < HOURS_SHOWN_BEFORE_DAYS) return `${elapsedInHours} hour${elapsedInHours === 1 ? "" : "s"} ago`;
  return `${Math.round(elapsedInHours / HOURS_PER_DAY)} days ago`;
}

/**
 * Whether queued pulls will actually run: a worker that checked in within
 * the last few minutes is online; one seen longer ago may have stopped; and
 * with none ever seen, nothing will run until someone starts one.
 */
export function describeWorkerStatus(
  workerLastSeenAt: string | null,
  nowInMilliseconds: number,
): { isOnline: boolean; text: string } {
  if (!workerLastSeenAt) {
    return {
      isOnline: false,
      text: "No pull worker has checked in yet, so queued pulls will wait until one runs. Start one with `python pull_worker.py` in apps/ingestion.",
    };
  }
  const elapsed = describeElapsed(workerLastSeenAt, nowInMilliseconds);
  const isOnline =
    nowInMilliseconds - Date.parse(workerLastSeenAt) <= WORKER_ONLINE_WITHIN_MINUTES * MILLISECONDS_PER_MINUTE;
  return isOnline
    ? { isOnline, text: `Pull worker online — last checked in ${elapsed}.` }
    : { isOnline, text: `Pull worker last checked in ${elapsed} and may be offline, so queued pulls will wait.` };
}

/** What a request asked for, in the terms the pull controls use. */
export function describePullWindow(pullRequest: Pick<IngestionPullRequest, "season" | "fromDate" | "toDate">): string {
  const season = pullRequest.season ?? "Current season";
  if (pullRequest.fromDate && pullRequest.toDate) return `${season}, ${pullRequest.fromDate} to ${pullRequest.toDate}`;
  if (pullRequest.fromDate) return `${season}, from ${pullRequest.fromDate}`;
  if (pullRequest.toDate) return `${season}, up to ${pullRequest.toDate}`;
  return `${season}, recent games`;
}
