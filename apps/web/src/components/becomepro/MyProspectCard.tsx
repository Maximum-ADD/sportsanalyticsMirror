import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Sparkline } from "@/components/Sparkline";
import { useSession } from "@/lib/authClient";
import { MY_BECOME_PRO_SUMMARY_QUERY_KEY, fetchMyBecomeProSummary } from "@/lib/becomeProApi";
import {
  COMPETITION_LEVEL_LABELS,
  describeValuationState,
  formatDraftSlot,
  formatProjectedValue,
} from "@/lib/prospectValue";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-landing-light bg-locker-surface p-4">
      <div className="mb-3 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          Become Pro
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
      </div>
      {children}
    </div>
  );
}

const LINK_CLASS =
  "mt-3 inline-block border border-landing-light bg-landing-hero px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather";

/**
 * The signed-in user's own projected value, small enough for the Home rail
 * and the profile page.
 *
 * Self-fetching like every other module on /home, and reading the lean
 * GET /v1/me/become-pro/summary rather than the whole Become Pro page — this
 * card shows a figure and a trend, not the NBA comparables, and pulling those
 * on two of the most-visited pages in the app to render four lines would be
 * waste.
 *
 * Signed out it renders nothing: both pages it sits on are already behind a
 * session, and an invitation nobody signed out can reach would be dead copy.
 */
export function MyProspectCard() {
  const { data: session } = useSession();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: MY_BECOME_PRO_SUMMARY_QUERY_KEY,
    queryFn: fetchMyBecomeProSummary,
    enabled: Boolean(session),
  });

  if (!session) return null;

  if (isPending) {
    return (
      <Shell>
        <div role="status" aria-label="Loading your Become Pro value" className="animate-pulse space-y-1.5">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-6 bg-landing-hero" />
          ))}
        </div>
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <p className="text-[12px] text-locker-bad">Could not load your projected value.</p>
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

  // Not started: an invitation, never an empty figure.
  if (data.season === null) {
    return (
      <Shell>
        <p className="text-[12.5px] text-locker-ink-muted">
          Log your own games and see what your season projects to against the NBA rookie salary scale —
          and which real NBA rookies your game looks most like.
        </p>
        <Link to="/become-pro" className={LINK_CLASS}>
          Start a season
        </Link>
      </Shell>
    );
  }

  const history = data.valueHistory.map((point) => point.valueUsd);
  const hasFigure = data.projectedValueUsd !== null;

  return (
    <Shell>
      <p className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
        {data.season} · {data.competitionLevel ? COMPETITION_LEVEL_LABELS[data.competitionLevel] : ""}
      </p>

      {hasFigure ? (
        <>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-display text-[30px] leading-tight text-landing-ink tabular-nums">
              {formatProjectedValue(data.projectedValueUsd)}
            </span>
            <span className="font-display text-[15px] text-locker-ink-muted tabular-nums">
              {formatDraftSlot(data.projectedDraftSlot)}
            </span>
          </div>
          {/* A single valuation is a dot, not a trend — the sparkline waits
              for a second one rather than implying movement. */}
          {history.length > 1 && (
            <Sparkline
              points={history}
              label={`Your projected value across your last ${history.length} valuations`}
              className="mt-2"
            />
          )}
          <p className="mt-2 text-[11px] text-locker-ink-muted">
            Projection · self-reported · {data.gamesLogged} {data.gamesLogged === 1 ? "game" : "games"}
          </p>
        </>
      ) : (
        <p className="mt-2 border border-dashed border-landing-light bg-landing-hero px-4 py-3 text-[12.5px] text-locker-ink-muted">
          {describeValuationState(data.valuationState, data.gamesLogged, data.minimumGamesRequired)}
        </p>
      )}

      <Link to="/become-pro" className={LINK_CLASS}>
        {hasFigure ? "My season" : "Log games"}
      </Link>
    </Shell>
  );
}
