import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { fetchLeaderboard } from "@/lib/nbaApi";
import type { LeaderboardEntry } from "@/types/nba";

const PERCENT_1DP = (rate: number) => `${(rate * 100).toFixed(1)}%`;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Card className="rounded-none border-landing-light bg-locker-surface p-4">
      <div className="mb-3 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          Accuracy leaderboard
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
      </div>
      {children}
    </Card>
  );
}

/**
 * Who is calling games most accurately, with the Elo model on the board.
 *
 * The model is styled as a benchmark rather than a rival, because the two
 * columns are not strictly like-for-like: a user's figure covers only the
 * games they chose to call, while the model's covers every game it predicted.
 * Finishing above it is a good sign, not a proof — the honest head-to-head is
 * the same-subset record shown on the Beat the Model card, and the footnote
 * below says so rather than letting the ranking imply more than it can.
 */
export function LeaderboardCard() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
  });

  if (isPending) {
    return (
      <Shell>
        <div className="flex min-h-24 items-center justify-center">
          <BasketballSpinner label="Loading leaderboard" />
        </div>
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <p className="text-[12px] text-locker-bad">Could not load the leaderboard.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 text-[12px] text-locker-leather underline underline-offset-[3px]"
        >
          Try again
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <table className="w-full text-left text-[12.5px]">
        <caption className="sr-only">
          Accuracy at calling game winners, best first, including the Elo model
        </caption>
        <thead>
          <tr className="border-b border-landing-light">
            <th scope="col" className="pb-1.5 font-mono text-[9px] tracking-[0.14em] text-locker-ink-muted uppercase">
              #
            </th>
            <th scope="col" className="pb-1.5 font-mono text-[9px] tracking-[0.14em] text-locker-ink-muted uppercase">
              Caller
            </th>
            <th scope="col" className="pb-1.5 text-right font-mono text-[9px] tracking-[0.14em] text-locker-ink-muted uppercase">
              Calls
            </th>
            <th scope="col" className="pb-1.5 text-right font-mono text-[9px] tracking-[0.14em] text-locker-ink-muted uppercase">
              Accuracy
            </th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((entry) => (
            <LeaderboardRow key={`${entry.kind}-${entry.name}`} entry={entry} />
          ))}
        </tbody>
      </table>

      {data.entries.every((entry) => entry.kind === "model") && (
        <p className="mt-3 text-[11px] text-locker-ink-muted">
          Nobody has qualified yet. Make {data.minimumCallsRequired} calls on Beat the Model and you will appear
          here.
        </p>
      )}

      <p className="mt-3 border-t border-landing-light pt-2.5 text-[11px] text-locker-ink-muted">
        Minimum {data.minimumCallsRequired} calls to qualify, so one lucky call cannot top the board. The model&rsquo;s
        row covers every game it predicted, not just the ones you called — the strictly like-for-like comparison
        is your own record above.
      </p>
    </Shell>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const isModel = entry.kind === "model";

  return (
    <tr className={isModel ? "bg-landing-hero" : undefined}>
      <td className="py-1.5 text-locker-ink-muted tabular-nums">{entry.rank}</td>
      <td className="py-1.5">
        <span className={isModel ? "font-semibold text-locker-model" : "text-landing-ink"}>{entry.name}</span>
        {/* The word does the work, not the row colour — the benchmark has to
            be identifiable in greyscale and to a screen reader too. */}
        {isModel && (
          <span className="ml-1.5 font-mono text-[8.5px] tracking-[0.12em] text-locker-ink-muted uppercase">
            benchmark
          </span>
        )}
      </td>
      <td className="py-1.5 text-right text-locker-ink-muted tabular-nums">{entry.calls}</td>
      <td
        className={`py-1.5 text-right font-semibold tabular-nums ${
          isModel ? "text-locker-model" : "text-locker-you"
        }`}
      >
        {PERCENT_1DP(entry.hitRate)}
      </td>
    </tr>
  );
}
