import {
  RELIABILITY_TIER_LABELS,
  describeReliability,
  formatReliabilityScore,
} from "@/lib/prospectValue";
import type { ProspectReliability } from "@/types/nba";

interface ReliabilityMeterProps {
  reliability: ProspectReliability;
}

// Three segments, one per tier, filled up to where this season sits. The
// segment count is the tier ladder made visible — it is not a percentage bar,
// because the tier is what changes how the value figure is presented and a
// continuous bar would imply a precision the tiers do not have.
const TIER_FILL: Record<ProspectReliability["tier"], number> = {
  UNDOCUMENTED: 0,
  PARTIAL: 2,
  STRONG: 3,
};

const SEGMENT_COUNT = 3;

/**
 * How much of a season's line is backed by verified documents.
 *
 * Every signal here is carried by a word or a number first: the tier is named,
 * the fraction is spelled out, and the meter only reinforces them. That is the
 * same rule HitMissPill follows — colour is never the only channel, so the
 * component reads identically in greyscale and to a screen reader.
 *
 * Note this is NOT lib/reliability.ts's PredictionReliability, which measures
 * something else entirely (how close a player's recent games landed to today's
 * predicted points).
 */
export function ReliabilityMeter({ reliability }: ReliabilityMeterProps) {
  const filled = TIER_FILL[reliability.tier];
  const tierLabel = RELIABILITY_TIER_LABELS[reliability.tier];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
          Reliability
        </span>
        <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
          {tierLabel}
        </span>
      </div>

      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="font-display text-[22px] text-landing-ink tabular-nums">
          {formatReliabilityScore(reliability.score)}
        </span>
        <span className="text-[11.5px] text-locker-ink-muted">{describeReliability(reliability)}</span>
      </div>

      {/* Decorative: the number and the two labels above already carry every
          fact this meter shows, so it is hidden rather than read out twice. */}
      <div aria-hidden className="mt-2 flex gap-1">
        {Array.from({ length: SEGMENT_COUNT }, (_, index) => (
          <span
            key={index}
            className={`h-1.5 flex-1 ${index < filled ? "bg-locker-leather" : "bg-landing-light"}`}
          />
        ))}
      </div>

      <p className="mt-2 text-[11px] text-locker-ink-muted">
        Measures how much of this line is backed by uploaded documents an admin has checked — not
        whether the figures are true.
      </p>
    </div>
  );
}
