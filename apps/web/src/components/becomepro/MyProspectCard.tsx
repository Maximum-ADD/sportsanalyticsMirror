import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Sparkline } from "@/components/Sparkline";
import { ProRankBadge } from "@/components/becomepro/ProRankBadge";
import { PROSPECT_RANK_QUERY_KEY, fetchMyProspectRank } from "@/lib/becomeProApi";
import { describeRankState, formatProjectedValue } from "@/lib/prospectValue";
import { useSession } from "@/lib/authClient";

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

/**
 * The signed-in user's own standing, small enough for the Home rail and the
 * profile page.
 *
 * Self-fetching like every other module on /home, and deliberately reading the
 * lean GET /v1/me/become-pro rather than a whole prospect profile — this card
 * shows a figure and a rank, not a breakdown, so pulling a profile (with its
 * game log, evidence list and comparables) to render four lines would be waste
 * on two of the most-visited pages in the app.
 *
 * Signed out it renders nothing at all: the Home page is already gated behind
 * a session, and an invitation on a page you cannot reach signed out would be
 * dead copy.
 */
export function MyProspectCard() {
  const { data: session } = useSession();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: PROSPECT_RANK_QUERY_KEY,
    queryFn: fetchMyProspectRank,
    enabled: Boolean(session),
  });

  if (!session) return null;

  if (isPending) {
    return (
      <Shell>
        <div role="status" aria-label="Loading your Become Pro standing" className="animate-pulse space-y-1.5">
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
        <p className="text-[12px] text-locker-bad">Could not load your standing.</p>
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

  const shortfall = describeRankState(data.rankState, data.gamesLogged, data.minimumGamesRequired);
  // No figure below the floor — the same rule the full card follows. A zero
  // here would be a valuation the model never produced.
  const hasFigure = data.projectedValueUsd !== null;
  // Two points is the minimum a line can be drawn through; one valuation is a
  // dot, not a trend, so the sparkline waits rather than drawing something
  // that implies movement.
  const history = data.valueHistory.map((point) => point.valueUsd);

  return (
    <Shell>
      {hasFigure ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
              Projection · self-reported
            </span>
            <ProRankBadge rank={data.rank} className="text-locker-leather" />
          </div>
          <p className="mt-1 font-display text-[30px] text-landing-ink tabular-nums">
            {formatProjectedValue(data.projectedValueUsd)}
          </p>
          {history.length > 1 && (
            <Sparkline
              points={history}
              label={`Your projected value across the last ${history.length} valuations`}
              className="mt-2"
            />
          )}
          <p className="mt-2 text-[11px] text-locker-ink-muted">
            From {data.gamesLogged} self-reported {data.gamesLogged === 1 ? "game" : "games"}.
          </p>
        </>
      ) : (
        <p className="border border-dashed border-landing-light bg-landing-hero px-4 py-3 text-[12.5px] text-locker-ink-muted">
          {shortfall ?? "Log a season to see what it projects to."}
        </p>
      )}

      <Link
        to={data.username ? `/become-pro/${data.username}` : "/become-pro"}
        className="mt-3 inline-block border border-landing-light bg-landing-hero px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather"
      >
        {hasFigure ? "My season" : "Start a season"}
      </Link>
    </Shell>
  );
}
