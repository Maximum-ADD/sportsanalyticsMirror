import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/apiClient";
import { fetchSavedComparisons, fetchSavedLineups } from "@/lib/nbaApi";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { Card } from "@/components/ui/card";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import type { SavedComparison, SavedLineup, SavedLineupDrift } from "@/types/nba";

const UNAUTHENTICATED_STATUS = 401;

// The shelf is a summary, not an archive — the full lists live on /compare
// and /optimizer. Asking for a few keeps the card short and the query cheap.
const SHELF_PAGE_SIZE = 5;

const CURRENCY = new Intl.NumberFormat("en-US");

function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === UNAUTHENTICATED_STATUS;
}

function ShelfLabel({ children }: { children: string }) {
  return (
    <p className="mb-0.5 font-mono text-[10px] tracking-[0.2em] text-locker-ink-muted uppercase">{children}</p>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Card className="rounded-none border-landing-light bg-locker-surface p-4">
      <div className="mb-3 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          Saved shelf
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
      </div>
      {children}
    </Card>
  );
}

/**
 * Named comparisons and named lineups the user owns.
 *
 * Reads GET /v1/me/saved/comparisons and /v1/me/saved/lineups. The drift line
 * on a lineup is only computable because SavedLineupSlot freezes salaryAtSave
 * and predictedPointsAtSave at save time: PlayerPrediction is
 * append-and-take-latest, so re-deriving those numbers would silently change
 * what the user believes they saved.
 */
export function SavedShelfCard() {
  const comparisonsQuery = useQuery({
    queryKey: ["savedComparisons"],
    queryFn: () => fetchSavedComparisons({ pageSize: SHELF_PAGE_SIZE }),
    retry: (failureCount, error) => !isUnauthenticated(error) && failureCount < 2,
  });

  const lineupsQuery = useQuery({
    queryKey: ["savedLineups"],
    queryFn: () => fetchSavedLineups({ pageSize: SHELF_PAGE_SIZE }),
    retry: (failureCount, error) => !isUnauthenticated(error) && failureCount < 2,
  });

  if (comparisonsQuery.isPending || lineupsQuery.isPending) {
    return (
      <Shell>
        <div className="flex min-h-24 items-center justify-center">
          <BasketballSpinner label="Loading your saved shelf" />
        </div>
      </Shell>
    );
  }

  if (isUnauthenticated(comparisonsQuery.error) || isUnauthenticated(lineupsQuery.error)) {
    return (
      <Shell>
        <p className="text-[12px] text-locker-ink-muted">
          Sign in to keep named comparisons and lineups here instead of rebuilding them each visit.
        </p>
      </Shell>
    );
  }

  if (comparisonsQuery.isError || lineupsQuery.isError) {
    return (
      <Shell>
        <p className="text-[12px] text-locker-bad">Could not load your saved shelf.</p>
        <button
          type="button"
          onClick={() => {
            comparisonsQuery.refetch();
            lineupsQuery.refetch();
          }}
          className="mt-2 text-[12px] text-locker-leather underline underline-offset-[3px]"
        >
          Try again
        </button>
      </Shell>
    );
  }

  const comparisons = comparisonsQuery.data?.data ?? [];
  const lineups = lineupsQuery.data?.data ?? [];

  return (
    <Shell>
      <ShelfLabel>Saved comparisons</ShelfLabel>
      {comparisons.length === 0 ? (
        <p className="py-1.5 text-[11.5px] text-locker-ink-muted">
          Nothing saved yet — build one on{" "}
          <Link to="/compare" className="text-locker-leather underline underline-offset-[3px]">
            Compare
          </Link>
          .
        </p>
      ) : (
        <ul>
          {comparisons.map((comparison) => (
            <ComparisonRow key={comparison.id} comparison={comparison} />
          ))}
        </ul>
      )}

      <div className="mt-2.5 border-t border-landing-light pt-2.5">
        <ShelfLabel>Saved lineups</ShelfLabel>
        {lineups.length === 0 ? (
          <p className="py-1.5 text-[11.5px] text-locker-ink-muted">
            Nothing saved yet — build one in the{" "}
            <Link to="/optimizer" className="text-locker-leather underline underline-offset-[3px]">
              Optimizer
            </Link>
            .
          </p>
        ) : (
          <ul>
            {lineups.map((lineup) => (
              <LineupRow key={lineup.id} lineup={lineup} />
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

function ComparisonRow({ comparison }: { comparison: SavedComparison }) {
  const playerIds = comparison.players.map((entry) => entry.playerId).join(",");

  return (
    <li className="flex items-center gap-2.5 py-2">
      <span aria-hidden className="flex">
        {comparison.players.map((entry, index) => (
          <PlayerHeadshot
            key={entry.playerId}
            player={entry.player}
            size="sm"
            className={`size-5.5 bg-[#c3bfb9] text-[8px] text-locker-ink-muted ring-2 ring-locker-surface ${
              index > 0 ? "-ml-2" : ""
            }`}
          />
        ))}
      </span>
      <Link
        to={`/compare?ids=${playerIds}`}
        className="text-[12.5px] font-medium text-landing-ink hover:text-locker-leather"
      >
        {comparison.name}
      </Link>
      <span className="ml-auto text-[11px] text-locker-ink-muted tabular-nums">
        {comparison.players.length} players
      </span>
    </li>
  );
}

function LineupRow({ lineup }: { lineup: SavedLineup }) {
  return (
    <li className="flex items-start gap-2.5 py-2">
      <span className="flex-1">
        <Link
          to="/optimizer"
          className="text-[12.5px] font-medium text-landing-ink hover:text-locker-leather"
        >
          {lineup.name}
        </Link>
        <span className="mt-1 block text-[11px] text-locker-ink-muted">
          <DriftLine drift={lineup.drift} savedOn={lineup.createdAt} />
        </span>
      </span>
      <span className="text-right text-[11px] text-locker-ink-muted tabular-nums">
        {lineup.totalPredictedPointsAtSave.toFixed(1)} pts
        <br />${CURRENCY.format(lineup.budget)}
      </span>
    </li>
  );
}

/**
 * How far a lineup has moved since it was saved, in words and a signed number.
 *
 * The deltas are signed, and both directions are real: a lineup can get worse
 * as easily as better. The previous version of this card said "up X pts"
 * unconditionally, which would have reported a fall as a rise.
 */
function DriftLine({ drift, savedOn }: { drift: SavedLineupDrift | null; savedOn: string }) {
  const savedOnLabel = new Date(savedOn).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  // Drift is null until the saved players have fresh predictions to compare
  // against — fall back to the save date alone.
  if (drift === null) {
    return <>saved {savedOnLabel}</>;
  }


  if (drift.pointsDelta === 0 && drift.salaryDelta === 0) {
    return <>unchanged since you saved it, {savedOnLabel}</>;
  }

  const pointsRose = drift.pointsDelta > 0;

  return (
    <>
      <span className={pointsRose ? "font-semibold text-locker-good" : "font-semibold text-locker-bad"}>
        {pointsRose ? "up" : "down"} {Math.abs(drift.pointsDelta).toFixed(1)} pts
      </span>{" "}
      and{" "}
      <span className={drift.isOverBudget ? "font-semibold text-locker-bad" : undefined}>
        ${CURRENCY.format(Math.abs(drift.salaryDelta))} {drift.salaryDelta >= 0 ? "more" : "less"} salary
        {drift.isOverBudget && " — now over cap"}
      </span>{" "}
      since you saved it, {savedOnLabel}
    </>
  );
}
