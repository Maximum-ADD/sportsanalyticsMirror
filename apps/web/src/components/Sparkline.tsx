// A tiny inline trend graphic — the "last 8 games" column on the players
// leaderboard. Values map onto a fixed viewBox, so the line stays the same
// visual weight no matter how many games are plotted or how wide the cell
// stretches.

interface SparklineProps {
  points: number[];
  // Accessible name for the series — e.g. "Points across the last 8 games".
  // Required because the graphic has no text of its own (axe: an svg needs
  // an accessible name), and the surrounding table cell alone doesn't say
  // WHAT the line plots.
  label: string;
  className?: string;
}

const SPARKLINE_WIDTH = 88;
const SPARKLINE_HEIGHT = 24;
const SPARKLINE_PADDING_X = 2;
const SPARKLINE_PADDING_Y = 3;

// Maps values onto the viewBox, oldest at the left edge. A flat series
// (every value equal — e.g. 0,0,0,…) can't divide by its own range, so it
// sits at mid-height instead of producing NaN coordinates.
function toPolylineCoordinates(values: number[]): string | null {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const drawableWidth = SPARKLINE_WIDTH - SPARKLINE_PADDING_X * 2;
  const drawableHeight = SPARKLINE_HEIGHT - SPARKLINE_PADDING_Y * 2;

  return values
    .map((value, index) => {
      const x = SPARKLINE_PADDING_X + (index / (values.length - 1)) * drawableWidth;
      const y =
        SPARKLINE_PADDING_Y + (range === 0 ? drawableHeight / 2 : ((max - value) / range) * drawableHeight);
      return `${x},${y}`;
    })
    .join(" ");
}

export function Sparkline({ points, label, className }: SparklineProps) {
  const coordinates = toPolylineCoordinates(points);
  const midlineY = SPARKLINE_HEIGHT / 2;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      width={SPARKLINE_WIDTH}
      height={SPARKLINE_HEIGHT}
      className={className}
    >
      {coordinates ? (
        <polyline
          points={coordinates}
          fill="none"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-locker-leather"
        />
      ) : (
        // Fewer than two values can't draw a trend — a flat placeholder
        // line reads as "nothing to show" without a broken-looking graphic.
        <line
          x1={SPARKLINE_PADDING_X}
          y1={midlineY}
          x2={SPARKLINE_WIDTH - SPARKLINE_PADDING_X}
          y2={midlineY}
          strokeDasharray="3 3"
          className="stroke-landing-light"
        />
      )}
    </svg>
  );
}
