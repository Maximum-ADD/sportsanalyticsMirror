import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cancelIngestionRequest, fetchIngestionRequests, type IngestionRequestStatus } from "@/lib/adminApi";
import {
  PULL_REQUESTS_QUERY_KEY,
  describeElapsed,
  describePullWindow,
  describeWorkerStatus,
  isActivePullRequest,
} from "@/lib/pullQueue";

// While something is queued or running, refresh often enough to watch it
// move; otherwise don't poll at all.
const ACTIVE_QUEUE_POLL_INTERVAL_IN_MILLISECONDS = 15_000;

const STATUS_CLASS: Record<IngestionRequestStatus, string> = {
  QUEUED: "bg-yellow-100 text-yellow-800",
  RUNNING: "bg-blue-100 text-blue-800",
  SUCCEEDED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
};

/**
 * The pull queue, shown where the API can't run pulls itself (the deployed
 * site). Explains whether a worker is around to run them, lists recent
 * requests with how each ended, and lets an admin cancel one no worker has
 * picked up. A running pull is on another machine, so it can't be cancelled.
 */
export function PullQueuePanel({ workerLastSeenAt }: { workerLastSeenAt: string | null }) {
  const queryClient = useQueryClient();
  const { data: pullRequests, isError } = useQuery({
    queryKey: PULL_REQUESTS_QUERY_KEY,
    queryFn: fetchIngestionRequests,
    refetchInterval: (query) =>
      query.state.data?.some((pullRequest) => isActivePullRequest(pullRequest.status)) ? ACTIVE_QUEUE_POLL_INTERVAL_IN_MILLISECONDS : false,
  });

  const cancelMutation = useMutation({
    mutationFn: (requestId: string) => cancelIngestionRequest(requestId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PULL_REQUESTS_QUERY_KEY }),
  });

  const now = Date.now();
  const workerStatus = describeWorkerStatus(workerLastSeenAt, now);

  return (
    <div className="border border-landing-light bg-locker-surface p-3">
      <h3 className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">Pull queue</h3>
      <p className="mt-1 text-[11.5px] text-locker-ink-muted">
        This server can't reach stats.nba.com, so pulls are queued and run by a pull worker on a machine that
        can.
      </p>
      <p className={`mt-1 text-[11.5px] ${workerStatus.isOnline ? "text-locker-good" : "text-yellow-700"}`}>
        {workerStatus.text}
      </p>

      {isError && <p className="mt-2 text-[11px] text-locker-bad">Could not load the pull queue.</p>}
      {cancelMutation.isError && (
        <p className="mt-2 text-[11px] text-locker-bad">{cancelMutation.error.message}</p>
      )}

      {pullRequests && pullRequests.length === 0 && (
        <p className="mt-2 text-[11.5px] text-locker-ink-muted">No pulls queued yet.</p>
      )}

      {pullRequests && pullRequests.length > 0 && (
        <ul className="mt-2 divide-y divide-landing-light border-t border-landing-light">
          {pullRequests.map((pullRequest) => (
            <li key={pullRequest.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
              <span
                className={`inline-block rounded px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] uppercase ${STATUS_CLASS[pullRequest.status]}`}
              >
                {pullRequest.status}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-landing-ink">{describePullWindow(pullRequest)}</div>
                <div className="font-mono text-[10px] text-locker-ink-muted">
                  {pullRequest.scheduled ? "Scheduled" : `Requested by ${pullRequest.requestedBy?.name ?? "a removed user"}`}{" "}
                  {describeElapsed(pullRequest.requestedAt, now)}
                  {pullRequest.claimedBy && ` · run on ${pullRequest.claimedBy}`}
                </div>
                {pullRequest.message && (
                  <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-locker-ink-muted">
                    {pullRequest.message}
                  </pre>
                )}
              </div>
              {pullRequest.status === "QUEUED" && (
                <button
                  type="button"
                  className="border border-landing-light px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-locker-ink-muted uppercase hover:border-locker-leather disabled:opacity-40"
                  disabled={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate(pullRequest.id)}
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
