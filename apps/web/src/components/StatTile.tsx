import { describeStat } from "@/lib/statGlossary";

interface StatTileProps {
  label: string;
  value: string | number;
  /**
   * The plain-English name printed under the figure. Defaults to the shared
   * glossary's name for `label`, so most callers never pass it; a label the
   * glossary does not know (a plain word like "Position") gets no caption.
   */
  caption?: string;
  // When both are set, the tile shows a numeric input instead of the static
  // value — `editValue` is the raw number being edited (distinct from
  // `value`, which may be a formatted string like "47.5%").
  isEditing?: boolean;
  editValue?: number;
  onEditValueChange?: (value: number) => void;
}

// One figure in the profile's stat grids, in the locker language the
// predictions/home pages established: sharp border, mono micro-label,
// display-sized numeral, no rounded corners. The tiles sit inside a
// locker-surface panel, so each tile's ground is landing-hero — one step
// recessed against the panel, the same figure/ground pairing the model
// accuracy ledger uses.
//
// The abbreviation alone ("RPG", "TS%") means nothing to someone new to
// basketball stats, and the explanations used to live only in a one-time
// tutorial pop-up. So the tile spells its label out underneath the figure,
// always visible: nothing to hover (which a touch screen cannot do) and
// nothing extra to tab through, and a screen reader reads it in order with
// the number it names.
export function StatTile({ label, value, caption, isEditing = false, editValue, onEditValueChange }: StatTileProps) {
  const spelledOut = caption ?? describeStat(label)?.name;

  return (
    <div className="border border-landing-light bg-landing-hero px-4 py-3">
      <div className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">{label}</div>
      {isEditing && onEditValueChange ? (
        <input
          aria-label={`Edit ${label}`}
          type="number"
          value={editValue ?? 0}
          onChange={(event) => onEditValueChange(Number(event.target.value))}
          className="mt-1 w-full border border-landing-light bg-locker-surface px-2 py-1 font-display text-2xl text-landing-ink focus:border-locker-leather focus:outline-none"
        />
      ) : (
        <div className="mt-1 font-display text-[27px] text-landing-ink tabular-nums">{value}</div>
      )}
      {spelledOut && <div className="mt-0.5 text-[11px] leading-snug text-locker-ink-muted">{spelledOut}</div>}
    </div>
  );
}
