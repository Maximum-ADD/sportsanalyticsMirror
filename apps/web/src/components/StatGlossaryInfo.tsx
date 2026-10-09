import { InfoTooltip } from "@/components/InfoTooltip";
import { requireStat } from "@/lib/statGlossary";

/**
 * An "i" button that opens what a group of stats measures and how to read
 * them, for the figures whose spelled-out name on the tile is not enough on
 * its own ("Usage rate" says what it is called, not what it counts).
 *
 * One button per group rather than one per tile: a row of twelve "i"
 * buttons would be twelve extra tab stops, and InfoTooltip's panel hangs
 * leftwards off its button, so it needs to sit at the right-hand end of a
 * heading or control row, not inside a narrow tile.
 */
export function StatGlossaryInfo({ label, stats }: { label: string; stats: readonly string[] }) {
  return (
    <InfoTooltip label={label}>
      <dl className="space-y-2">
        {stats.map((stat) => (
          <div key={stat}>
            <dt className="font-mono text-[10px] tracking-[0.1em] text-landing-ink">{stat}</dt>
            <dd>{requireStat(stat).explain}</dd>
          </div>
        ))}
      </dl>
    </InfoTooltip>
  );
}
