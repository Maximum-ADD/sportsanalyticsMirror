interface StatTileProps {
  label: string;
  value: string | number;
}

export function StatTile({ label, value }: StatTileProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-text-primary">{value}</div>
    </div>
  );
}
