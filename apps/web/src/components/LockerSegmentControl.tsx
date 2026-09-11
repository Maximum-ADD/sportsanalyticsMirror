import { ALL_SEGMENTS, formatSeasonTypeShort } from "@/lib/seasonType";
import type { SeasonSegmentSelection } from "@/lib/seasonType";

interface LockerSegmentControlProps<TSelection extends SeasonSegmentSelection> {
  value: TSelection;
  onChange: (selection: TSelection) => void;
  options: readonly TSelection[];
  label?: string;
}

// Same radiogroup behaviour as SeasonSegmentControl, styled to match the
// sharp-edged "locker" design language Predictions and Home already use
// (font-mono uppercase labels, border-landing-light, no rounded corners,
// locker-leather for the selected state) instead of SeasonSegmentControl's
// rounded/border-border-subtle system — that system is shared with the
// Players/Compare/Player-profile pages and stays as-is for them.
export function LockerSegmentControl<TSelection extends SeasonSegmentSelection>({
  value,
  onChange,
  options,
  label = "Season segment",
}: LockerSegmentControlProps<TSelection>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap gap-1 border border-landing-light bg-landing-hero p-1"
    >
      {options.map((option) => {
        const isSelected = option === value;
        const optionLabel = option === ALL_SEGMENTS ? "All" : formatSeasonTypeShort(option);
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option)}
            className={`px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50 ${
              isSelected
                ? "bg-locker-leather text-white"
                : "text-locker-ink-muted hover:text-landing-ink"
            }`}
          >
            {optionLabel}
          </button>
        );
      })}
    </div>
  );
}
