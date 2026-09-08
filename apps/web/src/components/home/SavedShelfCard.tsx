import { Link } from "react-router-dom";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { Card } from "@/components/ui/card";
import type { SavedComparison, SavedLineup } from "./placeholderData";

interface SavedShelfCardProps {
  comparisons: SavedComparison[];
  lineups: SavedLineup[];
}

const CURRENCY = new Intl.NumberFormat("en-US");

function ShelfLabel({ children }: { children: string }) {
  return (
    <p className="mb-0.5 font-mono text-[10px] tracking-[0.2em] text-locker-ink-muted uppercase">{children}</p>
  );
}

// Named comparisons and named lineups — the two flagship features converted
// from throwaway or global into things the user owns. Shipping this is also
// what retires the three "Editing locally — not saved" apologies currently
// printed by OptimizerPage, PlayerProfilePage and GameDetailPage.
//
// The drift line is only computable because SavedLineupSlot freezes
// salaryAtSave and predictedPointsAtSave: PlayerPrediction is
// append-and-take-latest, so re-deriving would silently change what the
// user believes they saved.
export function SavedShelfCard({ comparisons, lineups }: SavedShelfCardProps) {
  return (
    <Card className="rounded-none border-landing-light bg-locker-surface p-4">
      <div className="mb-3 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          Saved shelf
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
      </div>

      <ShelfLabel>Saved comparisons</ShelfLabel>
      <ul>
        {comparisons.map((comparison) => (
          <li key={comparison.id} className="flex items-center gap-2.5 py-2">
            <span aria-hidden className="flex">
              {comparison.players.map((player, index) => (
                <PlayerHeadshot
                  key={player.nbaPlayerId}
                  player={player}
                  size="sm"
                  className={`size-5.5 bg-[#c3bfb9] text-[8px] text-locker-ink-muted ring-2 ring-locker-surface ${
                    index > 0 ? "-ml-2" : ""
                  }`}
                />
              ))}
            </span>
            <Link
              to={`/compare?ids=${comparison.players.map((player) => player.nbaPlayerId).join(",")}`}
              className="text-[12.5px] font-medium text-landing-ink hover:text-locker-leather"
            >
              {comparison.name}
            </Link>
            <span className="ml-auto text-[11px] text-locker-ink-muted tabular-nums">
              {comparison.players.length} players
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2.5 border-t border-landing-light pt-2.5">
        <ShelfLabel>Saved lineups</ShelfLabel>
        <ul>
          {lineups.map((lineup) => (
            <li key={lineup.id} className="flex items-start gap-2.5 py-2">
              <span className="flex-1">
                <Link
                  to="/optimizer"
                  className="text-[12.5px] font-medium text-landing-ink hover:text-locker-leather"
                >
                  {lineup.name}
                </Link>
                {/* Drift as words plus a signed number, never a bare colour. */}
                <span className="mt-1 block text-[11px] text-locker-ink-muted">
                  {lineup.drift ? (
                    <>
                      <span className="font-semibold text-locker-good">
                        up {lineup.drift.points.toFixed(1)} pts
                      </span>{" "}
                      and{" "}
                      <span className={lineup.drift.overCap ? "font-semibold text-locker-bad" : undefined}>
                        ${CURRENCY.format(lineup.drift.salary)} {lineup.drift.overCap ? "over cap" : "under cap"}
                      </span>{" "}
                      since you saved it, {lineup.drift.savedOn}
                    </>
                  ) : (
                    "unchanged since the last optimizer run"
                  )}
                </span>
              </span>
              <span className="text-right text-[11px] text-locker-ink-muted tabular-nums">
                {lineup.predictedPoints.toFixed(1)} pts
                <br />${CURRENCY.format(lineup.salary)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
