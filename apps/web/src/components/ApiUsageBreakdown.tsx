import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MyApiUsageBreakdown } from "@/lib/meApi";

interface DailyUsageTooltipPayloadEntry {
  payload: { date: string; count: number };
}

// Sharp-edged tooltip in the panel surface, matching PointsTrendChart's
// locker-palette convention rather than recharts' default styling.
function DailyUsageTooltip({ active, payload }: { active?: boolean; payload?: DailyUsageTooltipPayloadEntry[] }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  return (
    <div
      style={{
        background: "var(--color-locker-surface)",
        border: "1px solid var(--color-landing-light)",
        padding: "6px 10px",
      }}
    >
      <p style={{ margin: 0, color: "var(--color-locker-ink-muted)", fontSize: 11 }}>{formatDayLabel(datum.date)}</p>
      <p style={{ margin: 0, color: "var(--color-landing-ink)", fontSize: 12 }}>
        {datum.count} request{datum.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

// The API sends plain "YYYY-MM-DD" calendar dates, not instants — read as
// `new Date("2026-10-01")`, that's parsed as UTC midnight, which renders as
// the PREVIOUS day in any timezone behind UTC (e.g. "Sep 30" in US zones).
// Building the Date from the parsed parts in the local zone instead keeps
// the displayed day matching the one the API actually grouped requests
// into, regardless of the reader's timezone.
function formatDayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * How the usage total shown beside this (consumer.usageCount) breaks down:
 * a bar per recent day, and a ranked list of endpoints. The total itself
 * stays the one number ApiKeysSection already shows — this is what it's
 * made of, for a key owner wondering which of their own scripts is driving
 * it, not a replacement for it.
 *
 * byDay can be sparse (a day with zero requests has no row at all, per the
 * API's SQL GROUP BY) — recharts draws a gap rather than a zero bar for a
 * missing day, which reads fine at this chart's size and avoids inventing
 * rows that don't correspond to anything logged.
 */
export function ApiUsageBreakdown({ byEndpoint, byDay }: MyApiUsageBreakdown) {
  if (byEndpoint.length === 0) {
    return null;
  }

  const maxEndpointCount = Math.max(...byEndpoint.map((row) => row.count));
  const totalDayCount = byDay.reduce((sum, row) => sum + row.count, 0);
  const dailySummary =
    byDay.length === 0
      ? "No requests in the last 14 days"
      : `${totalDayCount} request${totalDayCount === 1 ? "" : "s"} over the last 14 days, ` +
        `from ${formatDayLabel(byDay[0].date)} to ${formatDayLabel(byDay[byDay.length - 1].date)}`;

  return (
    <div className="space-y-4 border border-landing-light bg-locker-surface p-4">
      <div>
        <p className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">Requests, last 14 days</p>
        {byDay.length === 0 ? (
          <p className="mt-2 text-[12px] text-locker-ink-muted">{dailySummary}</p>
        ) : (
          <div role="img" aria-label={dailySummary} className="mt-2 h-[140px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDayLabel}
                  stroke="var(--color-landing-light)"
                  tick={{ fill: "var(--color-locker-ink-muted)", fontSize: 10 }}
                />
                <YAxis
                  allowDecimals={false}
                  stroke="var(--color-landing-light)"
                  tick={{ fill: "var(--color-locker-ink-muted)", fontSize: 10 }}
                />
                <Tooltip content={<DailyUsageTooltip />} cursor={{ fill: "var(--color-landing-light)", opacity: 0.3 }} />
                <Bar dataKey="count" name="Requests" fill="var(--color-locker-leather)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div>
        <p className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">By endpoint</p>
        <ul className="mt-2 space-y-1.5">
          {byEndpoint.map((row) => (
            <li key={row.endpoint} className="flex items-center gap-2">
              <span className="w-full max-w-[220px] shrink-0 truncate font-mono text-[11px] text-landing-ink">
                {row.endpoint}
              </span>
              <span className="h-2 flex-1 bg-landing-light/30">
                <span
                  className="block h-full bg-locker-leather"
                  style={{ width: `${(row.count / maxEndpointCount) * 100}%` }}
                />
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-[11px] text-locker-ink-muted">
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
