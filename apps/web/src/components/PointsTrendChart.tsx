import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface GamePointsDatum {
  gameLabel: string;
  points: number;
  // Set on projected points for upcoming games so the tooltip can name the
  // matchup — absent on played games, which have no opponent context left
  // to show (the trend line plots scoring, not matchups).
  opponent?: string;
  isHome?: boolean;
}

interface PointsTrendChartProps {
  data: GamePointsDatum[];
  // The data is a projection rather than played games: the line renders
  // dashed with no dots so a forecast never masquerades as a record.
  projected?: boolean;
}

// What recharts hands a custom Tooltip's content — only the fields the
// tooltip below actually reads.
interface TooltipPayloadEntry {
  payload: GamePointsDatum;
}

interface GamePointsTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  projected: boolean;
}

// Sharp-edged tooltip in the panel surface, matching the locker palette the
// axes already hard-code. Played games show the raw night; projected games
// name the opponent ("G12 · at BOS") and mark the figure as a projection.
function GamePointsTooltip({ active, payload, projected }: GamePointsTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;
  const matchup = datum.opponent ? ` · ${datum.isHome ? "vs" : "at"} ${datum.opponent}` : "";
  return (
    <div
      style={{
        background: "var(--color-locker-surface)",
        border: "1px solid var(--color-landing-light)",
        padding: "6px 10px",
      }}
    >
      <p style={{ margin: 0, color: "var(--color-locker-ink-muted)", fontSize: 11 }}>
        {datum.gameLabel}
        {matchup}
      </p>
      <p style={{ margin: 0, color: "var(--color-landing-ink)", fontSize: 12 }}>
        {projected ? "Projected " : ""}
        {datum.points.toFixed(1)} pts
      </p>
    </div>
  );
}

// Locker-palette chart: leather line on the landing-light grid, muted ink
// ticks, and a sharp-edged tooltip in the panel surface. Hard-codes the
// locker CSS variables rather than reading the old dark-shell tokens —
// this chart only renders on the player profile, which lives on the
// locker ground.
export function PointsTrendChart({ data, projected = false }: PointsTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <XAxis
          dataKey="gameLabel"
          stroke="var(--color-landing-light)"
          tick={{ fill: "var(--color-locker-ink-muted)", fontSize: 11 }}
        />
        <YAxis
          stroke="var(--color-landing-light)"
          tick={{ fill: "var(--color-locker-ink-muted)", fontSize: 11 }}
        />
        <Tooltip content={<GamePointsTooltip projected={projected} />} />
        <Line
          type="monotone"
          dataKey="points"
          name={projected ? "Projected points" : "Points"}
          stroke="var(--color-locker-leather)"
          strokeWidth={2}
          strokeOpacity={projected ? 0.75 : 1}
          strokeDasharray={projected ? "6 4" : undefined}
          dot={projected ? false : { r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
