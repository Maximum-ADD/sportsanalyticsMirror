import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface GamePointsDatum {
  gameLabel: string;
  points: number;
}

interface PointsTrendChartProps {
  data: GamePointsDatum[];
}

export function PointsTrendChart({ data }: PointsTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <XAxis
          dataKey="gameLabel"
          stroke="var(--color-text-muted)"
          tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }}
        />
        <YAxis stroke="var(--color-text-muted)" tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            background: "var(--color-surface-card)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: 8,
          }}
          labelStyle={{ color: "var(--color-text-secondary)" }}
        />
        <Line type="monotone" dataKey="points" stroke="var(--color-brand-accent)" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
