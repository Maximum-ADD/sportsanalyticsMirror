interface PointsSparklineProps {
  /** Points scored per game, oldest first. */
  points: number[];
  playerName: string;
}

const VIEWBOX_WIDTH = 240;
const VIEWBOX_HEIGHT = 40;
const PADDING = 3;

// Hand-rolled inline SVG rather than Recharts, deliberately: PointsTrendChart
// is hard-coded to height 220 (far too tall for a card in a grid), and a
// board of nine simultaneous ResponsiveContainers is a measurable stutter on
// first paint. This renders one <polyline> and no JavaScript at runtime.
//
// preserveAspectRatio="none" lets the line stretch to whatever width the card
// ends up at while the stroke stays a consistent visual weight.
export function PointsSparkline({ points, playerName }: PointsSparklineProps) {
  if (points.length < 2) return null;

  const low = Math.min(...points);
  const high = Math.max(...points);
  // A flat run would divide by zero; drawing it along the baseline is correct.
  const span = high - low || 1;

  const coordinates = points.map((value, index) => {
    const x = PADDING + (index * (VIEWBOX_WIDTH - PADDING * 2)) / (points.length - 1);
    const y = VIEWBOX_HEIGHT - PADDING - ((value - low) / span) * (VIEWBOX_HEIGHT - PADDING * 2);
    return { x, y };
  });

  const line = coordinates.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const baseline = VIEWBOX_HEIGHT - PADDING;
  const area = `M${PADDING},${baseline} L${line.split(" ").join(" L")} L${VIEWBOX_WIDTH - PADDING},${baseline} Z`;
  const last = coordinates[coordinates.length - 1];

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${playerName} points in the last ${points.length} games: ${points.join(", ")}`}
      className="block h-10 w-full"
    >
      <path d={area} fill="var(--color-locker-you)" fillOpacity={0.13} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--color-locker-you)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Emphasized endpoint — the most recent game is the one being read. */}
      <circle
        cx={last.x}
        cy={last.y}
        r={3}
        fill="var(--color-locker-you)"
        stroke="var(--color-locker-surface)"
        strokeWidth={1.5}
      />
    </svg>
  );
}
