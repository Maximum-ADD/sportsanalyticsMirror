import { cn } from "@/lib/utils";
import { useInView } from "@/lib/useInView";

// The hero's quiet second layer: a half-court diagram drawn faintly over
// the right side of the photo, with a brand-accent comet lapping the
// boundary — the hero's echo of the orange scan line on What We Do.
// Decorative throughout (aria-hidden); the copy never depends on it.

// All geometry below is a real NBA half-court at 10 SVG units per foot,
// baseline at the bottom, half-court line at the top:
//   50ft wide x 47ft deep, key 16ft x 19ft, free-throw circle 6ft radius,
//   three-point arc 23.75ft around a basket 5.25ft off the baseline with
//   14ft corner lines 22ft either side of it, restricted-area arc 4ft.
const COURT_VIEWBOX_WIDTH = 500;
const COURT_VIEWBOX_HEIGHT = 470;
const COURT_OUTLINE_PATH = "M 0 470 L 0 0 L 500 0 L 500 470 Z";
// 2 * (500 + 470) — the boundary's total length. The comet's dash period is
// derived from it, which is what makes one dashoffset cycle a seamless lap
// (see the hero-court-pulse keyframes in index.css).
const COURT_OUTLINE_LENGTH = 1940;
const COMET_LENGTH = 40;
const COMET_DASH_PATTERN = `${COMET_LENGTH} ${COURT_OUTLINE_LENGTH - COMET_LENGTH}`;
const THREE_POINT_PATH = "M 30 470 L 30 330 A 237.5 237.5 0 0 1 470 330 L 470 470";
const KEY_PATH = "M 170 470 L 170 280 L 330 280 L 330 470";
const FREE_THROW_CIRCLE_RADIUS = 60;
const CENTER_CIRCLE_PATH = "M 190 0 A 60 60 0 0 1 310 0";
const RESTRICTED_AREA_PATH = "M 210 417.5 A 40 40 0 0 1 290 417.5";

const MARKING_CLASSES = "stroke-white/12";
const MARKING_STROKE_WIDTH = 2;
const BOUNDARY_CLASSES = "stroke-white/18";
const BOUNDARY_STROKE_WIDTH = 3;
const COMET_STROKE_WIDTH = 2.5;
const COMET_GLOW_STROKE_WIDTH = 6;
const COMET_GLOW_OPACITY = 0.15;

// Draw-in: every marking is normalized with pathLength=1, so "1" is both
// the dash period and the hidden-state offset — sliding the offset from 1
// to 0 draws the line from its start point to its end. Staggered delays
// layer the diagram up (frame first, then each interior line) before the
// comet fades in on top.
const MARKING_DRAW_TRANSITION = "transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none";
const BOUNDARY_DRAW_DELAY_IN_MS = 0;
const THREE_POINT_DRAW_DELAY_IN_MS = 300;
const KEY_DRAW_DELAY_IN_MS = 450;
const FREE_THROW_CIRCLE_DRAW_DELAY_IN_MS = 600;
const CENTER_CIRCLE_DRAW_DELAY_IN_MS = 750;
const RESTRICTED_AREA_DRAW_DELAY_IN_MS = 900;
const COMET_FADE_TRANSITION = "transition-opacity duration-700 ease-out motion-reduce:transition-none";
const COMET_FADE_DELAY_IN_MS = 1500;

interface DrawnMarkingProps {
  isInView: boolean;
  drawDelayInMs: number;
  className: string;
  strokeWidth: number;
}

/**
 * One court line that draws itself end to end once the hero enters the
 * viewport (pathLength-normalized — see the draw-in constants above).
 */
function DrawnPath({ isInView, drawDelayInMs, className, strokeWidth, pathData }: DrawnMarkingProps & { pathData: string }) {
  return (
    <path
      d={pathData}
      pathLength={1}
      strokeDasharray="1 1"
      strokeDashoffset={isInView ? 0 : 1}
      className={cn(MARKING_DRAW_TRANSITION, className)}
      strokeWidth={strokeWidth}
      style={{ transitionDelay: `${drawDelayInMs}ms` }}
    />
  );
}

/** The free-throw circle — same draw-in treatment as the paths. */
function DrawnCircle({ isInView, drawDelayInMs, className, strokeWidth, radius }: DrawnMarkingProps & { radius: number }) {
  return (
    <circle
      cx={250}
      cy={280}
      r={radius}
      pathLength={1}
      strokeDasharray="1 1"
      strokeDashoffset={isInView ? 0 : 1}
      className={cn(MARKING_DRAW_TRANSITION, className)}
      strokeWidth={strokeWidth}
      style={{ transitionDelay: `${drawDelayInMs}ms` }}
    />
  );
}

export function HeroCourtLines() {
  // Replay mode keeps the sequence in step with the hero text: the court
  // draws in, the comet fades up — and both reset and replay whenever the
  // hero re-enters the viewport, like every other landing-page entrance.
  const { elementRef, isInView } = useInView<HTMLDivElement>({ replay: true });

  return (
    <div
      ref={elementRef}
      aria-hidden
      className="pointer-events-none absolute top-1/2 right-[4%] hidden aspect-[50/47] h-[86%] -translate-y-1/2 md:block lg:right-[7%]"
    >
      <svg
        viewBox={`0 0 ${COURT_VIEWBOX_WIDTH} ${COURT_VIEWBOX_HEIGHT}`}
        fill="none"
        className="size-full"
      >
        {/* The boundary frames the court as it draws, then carries the comet. */}
        <DrawnPath
          isInView={isInView}
          drawDelayInMs={BOUNDARY_DRAW_DELAY_IN_MS}
          className={BOUNDARY_CLASSES}
          strokeWidth={BOUNDARY_STROKE_WIDTH}
          pathData={COURT_OUTLINE_PATH}
        />

        {/* Interior markings — static once drawn, purely architectural. */}
        <DrawnPath
          isInView={isInView}
          drawDelayInMs={THREE_POINT_DRAW_DELAY_IN_MS}
          className={MARKING_CLASSES}
          strokeWidth={MARKING_STROKE_WIDTH}
          pathData={THREE_POINT_PATH}
        />
        <DrawnPath
          isInView={isInView}
          drawDelayInMs={KEY_DRAW_DELAY_IN_MS}
          className={MARKING_CLASSES}
          strokeWidth={MARKING_STROKE_WIDTH}
          pathData={KEY_PATH}
        />
        <DrawnCircle
          isInView={isInView}
          drawDelayInMs={FREE_THROW_CIRCLE_DRAW_DELAY_IN_MS}
          className={MARKING_CLASSES}
          strokeWidth={MARKING_STROKE_WIDTH}
          radius={FREE_THROW_CIRCLE_RADIUS}
        />
        <DrawnPath
          isInView={isInView}
          drawDelayInMs={CENTER_CIRCLE_DRAW_DELAY_IN_MS}
          className={MARKING_CLASSES}
          strokeWidth={MARKING_STROKE_WIDTH}
          pathData={CENTER_CIRCLE_PATH}
        />
        <DrawnPath
          isInView={isInView}
          drawDelayInMs={RESTRICTED_AREA_DRAW_DELAY_IN_MS}
          className={MARKING_CLASSES}
          strokeWidth={MARKING_STROKE_WIDTH}
          pathData={RESTRICTED_AREA_PATH}
        />

        {/* The comet fades in once the lines have drawn: a wide soft pass
            under a tight bright core. Both share the same dash pattern,
            path, and animations, so they travel as one breathing streak —
            gliding around corners and surging down the sidelines. */}
        <g
          className={cn(COMET_FADE_TRANSITION, isInView ? "opacity-100" : "opacity-0")}
          style={{ transitionDelay: `${COMET_FADE_DELAY_IN_MS}ms` }}
        >
          <path
            d={COURT_OUTLINE_PATH}
            className="hero-court-pulse stroke-brand-accent"
            strokeWidth={COMET_GLOW_STROKE_WIDTH}
            strokeOpacity={COMET_GLOW_OPACITY}
            strokeLinecap="round"
            strokeDasharray={COMET_DASH_PATTERN}
          />
          <path
            d={COURT_OUTLINE_PATH}
            className="hero-court-pulse stroke-brand-accent"
            strokeWidth={COMET_STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={COMET_DASH_PATTERN}
          />
        </g>
      </svg>
    </div>
  );
}
