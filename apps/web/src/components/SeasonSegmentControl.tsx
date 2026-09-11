import { ALL_SEGMENTS, formatSeasonTypeShort } from "@/lib/seasonType";
import type { SeasonSegmentSelection } from "@/lib/seasonType";

interface SeasonSegmentControlProps<TSelection extends SeasonSegmentSelection> {
  value: TSelection;
  onChange: (selection: TSelection) => void;
  // The options to offer, in the order they should read. Passed explicitly
  // rather than defaulted so a view has to state whether it offers "All":
  // the games list can show a whole season at once, but the player views
  // must not, since a line averaged across segments is exactly what this
  // feature exists to prevent. Generic so a caller that only offers real
  // segments gets a SeasonType back, not a wider union it has to narrow.
  options: readonly TSelection[];
  label?: string;
}

// A segmented control for picking which part of the season a view shows.
// Rendered as a radiogroup rather than a plain row of buttons so keyboard
// and screen-reader behaviour matches what the control actually is: one
// choice out of a small set of mutually exclusive views.
export function SeasonSegmentControl<TSelection extends SeasonSegmentSelection>({
  value,
  onChange,
  options,
  label = "Season segment",
}: SeasonSegmentControlProps<TSelection>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap gap-1 rounded-lg border border-border-subtle bg-surface-card p-1"
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
            className={`rounded-md px-3 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-accent/50 ${
              isSelected
                ? "bg-brand-accent/15 font-medium text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {optionLabel}
          </button>
        );
      })}
    </div>
  );
}
