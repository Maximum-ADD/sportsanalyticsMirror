import { Sparkline } from "@/components/Sparkline";
import {
  COMPETITION_LEVEL_LABELS,
  describeValuationState,
  formatDraftSlot,
  formatProjectedValue,
  formatValueRange,
} from "@/lib/prospectValue";
import type { CompetitionLevel, ProspectValuation, ProspectValuePoint, ValuationState } from "@/types/nba";

interface ProspectValueCardProps {
  valuation: ProspectValuation | null;
  valuationState: ValuationState | null;
  competitionLevel: CompetitionLevel;
  gamesLogged: number;
  minimumGamesRequired: number;
  valueHistory: ProspectValuePoint[];
}

const MICRO_LABEL = "font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase";

/**
 * What the user's season is projected to be worth.
 *
 * Presentational: everything it renders arrives as a prop, because the page
 * that shows it has already fetched the season this describes.
 *
 * Never renders a bare number. The projected DRAFT PICK is the primary object
 * because the pick is what the model actually predicts — the dollars are the
 * published rookie scale's consequence of it, so leading with the money would
 * overstate what was computed. Without a valuation there is no figure at all,
 * only the reason, which is the same rule every module in this app follows
 * when it has nothing real to show.
 */
export function ProspectValueCard({
  valuation,
  valuationState,
  competitionLevel,
  gamesLogged,
  minimumGamesRequired,
  valueHistory,
}: ProspectValueCardProps) {
  // Two points is the least a line can be drawn through; a single valuation is
  // a dot, not a trend, and drawing one would imply movement that has not
  // happened yet.
  const history = valueHistory.map((point) => point.valueUsd);

  return (
    <div className="border border-landing-light bg-locker-surface p-4">
      <div className="mb-3 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          Projected value
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
      </div>

      {valuation === null ? (
        <p className="border border-dashed border-landing-light bg-landing-hero px-4 py-3 text-[12.5px] text-locker-ink-muted">
          {describeValuationState(valuationState, gamesLogged, minimumGamesRequired)}
        </p>
      ) : (
        <>
          <span className={MICRO_LABEL}>Projection · self-reported</span>
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-display text-[20px] text-landing-ink tabular-nums">
              {formatDraftSlot(valuation.projectedDraftSlot)}
            </span>
            <span className="font-display text-[34px] leading-none text-landing-ink tabular-nums">
              {formatProjectedValue(valuation.projectedValueUsd)}
            </span>
          </div>
          {/* Always shown beside the figure: the honest reading of this model
              is "somewhere in this neighbourhood". */}
          <p className="mt-1 text-[12.5px] text-locker-ink-muted tabular-nums">
            Range {formatValueRange(valuation.projectedValueLowUsd, valuation.projectedValueHighUsd)}
          </p>

          {history.length > 1 && (
            <div className="mt-3">
              <span className={MICRO_LABEL}>Value over time</span>
              <Sparkline
                points={history}
                label={`Your projected value across your last ${history.length} valuations`}
                className="mt-1"
              />
            </div>
          )}

          {/* The model's assumption stated as an assumption, with the scale
              year printed so the figure cannot go silently stale. */}
          <p className="mt-3 border-t border-landing-light pt-3 text-[11.5px] text-locker-ink-muted">
            Projected from {gamesLogged} self-reported {gamesLogged === 1 ? "game" : "games"} at{" "}
            {COMPETITION_LEVEL_LABELS[competitionLevel]}, translated by a{" "}
            {valuation.levelFactor.toFixed(2)} level factor against the {valuation.rookieScaleYear} NBA
            rookie scale. This is a projection of a published draft-pick salary, not an offer and not a
            market price.
          </p>
          <p className="mt-2 text-[11px] text-locker-ink-muted">{valuation.levelFactorBasis}</p>

          {/* Server-authored. The client renders these and never composes one:
              a client-written explanation of a server-side model is invention. */}
          {valuation.drivers.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-landing-light pt-3">
              {valuation.drivers.map((driver) => (
                <li key={driver.label} className="text-[11.5px] text-locker-ink-muted">
                  <span className="font-mono text-[9px] tracking-[0.1em] text-landing-ink uppercase">
                    {driver.label}
                  </span>{" "}
                  — {driver.detail}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
