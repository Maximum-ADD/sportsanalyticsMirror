interface StatTileProps {
  label: string;
  value: string | number;
  // When both are set, the tile shows a numeric input instead of the static
  // value — `editValue` is the raw number being edited (distinct from
  // `value`, which may be a formatted string like "47.5%").
  isEditing?: boolean;
  editValue?: number;
  onEditValueChange?: (value: number) => void;
}

export function StatTile({ label, value, isEditing = false, editValue, onEditValueChange }: StatTileProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      {isEditing && onEditValueChange ? (
        <input
          aria-label={`Edit ${label}`}
          type="number"
          value={editValue ?? 0}
          onChange={(event) => onEditValueChange(Number(event.target.value))}
          className="mt-1 w-full rounded-md border border-border-subtle bg-surface-raised px-2 py-1 text-2xl font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/50"
        />
      ) : (
        <div className="mt-1 text-2xl font-semibold text-text-primary">{value}</div>
      )}
    </div>
  );
}
