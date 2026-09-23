import { ProRankBadge } from "@/components/becomepro/ProRankBadge";
import { ReliabilityMeter } from "@/components/becomepro/ReliabilityMeter";
import {
  COMPETITION_LEVEL_LABELS,
  describeRankState,
  formatDraftSlot,
  formatProjectedValue,
  formatValueRange,
} from "@/lib/prospectValue";
import type {
  CompetitionLevel,
  ProspectRankState,
  ProspectReliability,
  ProspectValuation,
} from "@/types/nba";

interface ProspectValueCardProps {
  valuation: ProspectValuation;
  reliability: ProspectReliability;
  rank: number | null;
  rankState: ProspectRankState;
  competitionLevel: CompetitionLevel;
  gamesLogged: number;
  /** Shown beside the rank badge; omitted where the name is already above. */
  displayName?: string;
}

// Deliberately presentational: everything it renders arrives as a prop.
//
// Both pages that show this card have already fetched the profile carrying the
// data, so a self-fetching card would either duplicate that request or need a
// second endpoint. The one surface that does need its own request — the small
// summary on Home and Profile — is MyProspectCard, which reads the lean
// GET /v1/me/become-pro rather than a whole profile.

// How the headline is weighted, by how much of the line is actually
// documented. A WORD carries every step of this ladder — the type size and the
// promotion of the range only reinforce it, so the demotion is still legible
// in greyscale and to a screen reader. The server widens the low/high band as
// coverage falls, so this reflects a real change in the model's confidence
// rather than styling alone.
const TIER_PRESENTATION: Record<
  ProspectReliability["tier"],
  { label: string; valueClass: string; leadWithRange: boolean }
> = {
  STRONG: {
    label: "Projection · self-reported",
    valueClass: "font-display text-[34px] text-landing-ink tabular-nums",
    leadWithRange: false,
  },
  PARTIAL: {
    label: "Projection · provisional",
    valueClass: "font-display text-[34px] text-landing-ink tabular-nums",
    leadWithRange: false,
  },
  UNDOCUMENTED: {
    label: "Unverified estimate",
    valueClass: "font-display text-[20px] text-locker-ink-muted tabular-nums",
    leadWithRange: true,
  },
};

/**
 * What a prospect's season is projected to be worth, and how much that
 * projection can be trusted.
 *
 * Never renders a bare number. The projected DRAFT SLOT is the primary object
 * because the slot is what the model actually predicts — the dollars are the
 * published rookie scale's consequence of it, so leading with the money would
 * overstate what was computed. Below the games floor there is no figure at
 * all, only the shortfall, which is the same rule LeaderboardCard follows for
 * its own qualification threshold.
 */
export function ProspectValueCard({
  valuation,
  reliability,
  rank,
  rankState,
  competitionLevel,
  gamesLogged,
  displayName,
}: ProspectValueCardProps) {
  const shortfall = describeRankState(rankState, gamesLogged, valuation.minimumGamesRequired);
  // The floor is the one case with no figure at all: projectedValueUsd comes
  // back null and a zero here would be a claim the model never made.
  const hasFigure = valuation.projectedValueUsd !== null;
  const presentation = TIER_PRESENTATION[reliability.tier];

  return (
    <div className="border border-landing-light bg-locker-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
          {hasFigure ? presentation.label : "Become Pro"}
        </span>
        {valuation.basis === "HYPOTHETICAL" && (
          <span className="font-mono text-[9px] tracking-[0.1em] text-locker-leather uppercase">
            Hypothetical
          </span>
        )}
      </div>

      {displayName && (
        <div className="mt-2 flex items-center gap-2">
          <ProRankBadge rank={rank} className="text-locker-leather" />
          <span className="font-display text-lg break-all text-landing-ink uppercase">
            {displayName}
          </span>
        </div>
      )}

      {hasFigure ? (
        <>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-display text-[20px] text-landing-ink tabular-nums">
              {formatDraftSlot(valuation.projectedDraftSlot)}
            </span>
            <span className={presentation.valueClass}>
              {formatProjectedValue(valuation.projectedValueUsd)}
            </span>
          </div>

          {/* Always shown, never suppressed — and promoted to the headline
              when nothing has been verified, because that is the honest
              reading of a figure with no documents behind it. */}
          <p
            className={
              presentation.leadWithRange
                ? "mt-1 font-display text-[26px] text-landing-ink tabular-nums"
                : "mt-1 text-[12.5px] text-locker-ink-muted tabular-nums"
            }
          >
            {presentation.leadWithRange ? "" : "Range "}
            {formatValueRange(valuation.projectedValueLowUsd, valuation.projectedValueHighUsd)}
          </p>
        </>
      ) : (
        <p className="mt-3 border border-dashed border-landing-light bg-landing-hero px-4 py-3 text-[12.5px] text-locker-ink-muted">
          {shortfall ?? "No valuation yet."}
        </p>
      )}

      {hasFigure && (
        <>
          {/* The model's assumption stated as an assumption, with the scale
              year printed so the figure cannot go silently stale. */}
          <p className="mt-3 border-t border-landing-light pt-3 text-[11.5px] text-locker-ink-muted">
            Projected from {gamesLogged} self-reported{" "}
            {gamesLogged === 1 ? "game" : "games"} at {COMPETITION_LEVEL_LABELS[competitionLevel]},
            translated by a {valuation.levelFactor.toFixed(2)} level factor against the{" "}
            {valuation.rookieScaleYear} NBA rookie scale. This is a projection of a published
            draft-slot salary, not an offer and not a market price.
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

          <div className="mt-4 border-t border-landing-light pt-3">
            <ReliabilityMeter reliability={reliability} />
          </div>
        </>
      )}

    </div>
  );
}
