import { useId } from "react";
import {
  TUTORIAL_HEADER_HEIGHT,
  TUTORIAL_MAP_HEIGHT,
  TUTORIAL_MAP_WIDTH,
  TUTORIAL_PAGE_FRAME,
  type TutorialMapRegion,
} from "@/lib/pageTutorial";
import { cn } from "@/lib/utils";

// Every length in this file is in map units (see lib/pageTutorial.ts): the SVG
// scales them all together, so they hold their proportions at any dialog width.

const BADGE_RADIUS = 5.5;
// The badge sits this far above the middle of the section it points at, so
// its arrow curves in rather than running flat along a section's edge.
const BADGE_RISE = 9;
// Clear space between an arrow's tip and the section's edge, so the head
// reads as pointing AT the section rather than drawn on top of it.
const ARROW_TIP_GAP = 1.2;
const LABEL_FONT_SIZE = 4;
const LABEL_INSET_X = 3;
const LABEL_BASELINE_Y = 5.8;
// Where a region's sketch starts below its top edge, clear of the label.
const SKETCH_TOP = 9;
const ROW_PITCH = 4.5;
// The share of the matchup's win-chance bar the favourite gets — any value
// well off 50% reads as "the model favours one side".
const MATCHUP_FAVOURITE_SHARE = 0.64;
// One player card's scoring line, as y offsets from the card's line baseline:
// a few real-looking rises and dips, ending on the latest game.
const SPARKLINE_OFFSETS = [0, -1.6, 0.4, -2.2, -0.8, -2.6];
// The chart sketch's line, as fractions of the plot's height above its
// baseline — a rise with a dip, so it reads as data rather than a ruler.
const CHART_LINE_SHARES = [0.2, 0.45, 0.35, 0.7, 0.55, 0.85];
// The bars sketch's bar heights, as fractions of the plot's height.
const BAR_SHARES = [0.55, 0.8, 0.4, 0.95, 0.65];
// Smallest card the card-grid sketch draws, so a big region gets more cards
// rather than a few stretched ones.
const MIN_GRID_CARD_WIDTH = 16;
const MIN_GRID_CARD_HEIGHT = 9;
const GRID_GAP = 2.5;

interface MapPoint {
  x: number;
  y: number;
}

interface CalloutGeometry {
  badge: MapPoint;
  arrowPath: string;
}

/**
 * Places a step's numbered badge in the margin on the region's callout side
 * and draws an S-curve from it to the middle of the region's near edge. The
 * curve leaves the badge and enters the region horizontally, so the arrow's
 * head always points straight into the section rather than at a corner.
 */
function computeCallout(region: TutorialMapRegion): CalloutGeometry {
  const isLeft = region.calloutSide === "left";
  const frameRight = TUTORIAL_PAGE_FRAME.x + TUTORIAL_PAGE_FRAME.width;
  const marginMiddleX = isLeft ? TUTORIAL_PAGE_FRAME.x / 2 : (frameRight + TUTORIAL_MAP_WIDTH) / 2;
  const regionMiddleY = region.y + region.height / 2;
  const badgeY = Math.min(
    Math.max(regionMiddleY - BADGE_RISE, BADGE_RADIUS + 1),
    TUTORIAL_MAP_HEIGHT - BADGE_RADIUS - 1
  );
  const direction = isLeft ? 1 : -1;

  const start = { x: marginMiddleX + direction * (BADGE_RADIUS + 0.8), y: badgeY };
  const tip = { x: (isLeft ? region.x : region.x + region.width) - direction * ARROW_TIP_GAP, y: regionMiddleY };
  const halfRun = (tip.x - start.x) / 2;

  return {
    badge: { x: marginMiddleX, y: badgeY },
    arrowPath: `M ${start.x} ${start.y} C ${start.x + halfRun} ${start.y}, ${tip.x - halfRun} ${tip.y}, ${tip.x} ${tip.y}`,
  };
}

/** A game headline, the model's win-chance bar and the two team buttons. */
function MatchupSketch({ region }: { region: TutorialMapRegion }) {
  const innerWidth = region.width - 8;
  const buttonWidth = (innerWidth - 3) / 2;
  const middleX = region.x + region.width / 2;
  const headlineY = region.y + SKETCH_TOP + 3;
  const barY = region.y + region.height * 0.55;
  const buttonY = region.y + region.height - 9;
  return (
    <g>
      <circle cx={middleX - 14} cy={headlineY} r={2} className="fill-landing-light" />
      <rect x={middleX - 10} y={headlineY - 0.8} width={20} height={1.6} className="fill-landing-light" />
      <circle cx={middleX + 14} cy={headlineY} r={2} className="fill-landing-light" />
      <rect x={region.x + 4} y={barY} width={innerWidth} height={2} className="fill-landing-light" />
      <rect x={region.x + 4} y={barY} width={innerWidth * MATCHUP_FAVOURITE_SHARE} height={2} className="fill-locker-model" />
      <rect x={region.x + 4} y={buttonY} width={buttonWidth} height={6} className="fill-locker-leather" />
      <rect x={region.x + 7 + buttonWidth} y={buttonY} width={buttonWidth} height={6} className="fill-locker-leather" />
    </g>
  );
}

/** Three small player cards, each with a headshot, a name and a scoring line. */
function PlayerCardsSketch({ region }: { region: TutorialMapRegion }) {
  const cardGap = 3;
  const cardWidth = (region.width - 8 - cardGap * 2) / 3;
  const cardHeight = region.height - SKETCH_TOP - 3;
  const cardIndexes = [0, 1, 2];
  return (
    <g>
      {cardIndexes.map((cardIndex) => {
        const cardX = region.x + 4 + cardIndex * (cardWidth + cardGap);
        const cardY = region.y + SKETCH_TOP;
        const lineBaselineY = cardY + cardHeight - 3;
        const pointSpacing = (cardWidth - 6) / (SPARKLINE_OFFSETS.length - 1);
        const sparklinePoints = SPARKLINE_OFFSETS.map(
          (offset, pointIndex) => `${cardX + 3 + pointIndex * pointSpacing},${lineBaselineY + offset}`
        ).join(" ");
        const lastPointX = cardX + 3 + (SPARKLINE_OFFSETS.length - 1) * pointSpacing;
        const lastPointY = lineBaselineY + SPARKLINE_OFFSETS[SPARKLINE_OFFSETS.length - 1];
        return (
          <g key={cardIndex}>
            <rect
              x={cardX}
              y={cardY}
              width={cardWidth}
              height={cardHeight}
              strokeWidth={0.4}
              className="fill-landing-hero/50 stroke-landing-light"
            />
            <circle cx={cardX + 3.5} cy={cardY + 3.5} r={1.8} className="fill-landing-light" />
            <rect x={cardX + 6.5} y={cardY + 2.8} width={cardWidth * 0.45} height={1.4} className="fill-landing-light" />
            <polyline points={sparklinePoints} fill="none" strokeWidth={0.6} className="stroke-locker-leather" />
            <circle cx={lastPointX} cy={lastPointY} r={0.8} className="fill-locker-leather" />
          </g>
        );
      })}
    </g>
  );
}

/** As many list rows as the region's height has room for. */
function RowsSketch({ region }: { region: TutorialMapRegion }) {
  const rowCount = Math.max(1, Math.floor((region.height - SKETCH_TOP) / ROW_PITCH));
  const rowIndexes = Array.from({ length: rowCount }, (_, rowIndex) => rowIndex);
  return (
    <g>
      {rowIndexes.map((rowIndex) => {
        const rowY = region.y + SKETCH_TOP + 1 + rowIndex * ROW_PITCH;
        return (
          <g key={rowIndex}>
            <circle cx={region.x + 5} cy={rowY} r={1.1} className="fill-landing-light" />
            <rect x={region.x + 8} y={rowY - 0.7} width={region.width * 0.5} height={1.4} className="fill-landing-light" />
            <rect x={region.x + region.width - 10} y={rowY - 0.7} width={6} height={1.4} className="fill-landing-light" />
          </g>
        );
      })}
    </g>
  );
}

/** One big figure, with its trend line underneath. */
function ValueSketch({ region }: { region: TutorialMapRegion }) {
  const figureY = region.y + SKETCH_TOP;
  const lineY = region.y + region.height - 3.5;
  const lineStartX = region.x + 4;
  const lineEndX = region.x + region.width - 4;
  return (
    <g>
      <rect x={lineStartX} y={figureY} width={region.width * 0.45} height={3.2} className="fill-landing-ink/70" />
      <polyline
        points={`${lineStartX},${lineY} ${lineStartX + (lineEndX - lineStartX) * 0.4},${lineY - 1.2} ${lineEndX},${lineY - 2.6}`}
        fill="none"
        strokeWidth={0.6}
        className="stroke-locker-leather"
      />
    </g>
  );
}

/** A row of headline figures, set to the right of the region's label. */
function StatBlocksSketch({ region }: { region: TutorialMapRegion }) {
  const blockCount = 3;
  const blocksStartX = region.x + region.width * 0.45;
  const blockGap = 3;
  const blockWidth = (region.x + region.width - 4 - blocksStartX - blockGap * (blockCount - 1)) / blockCount;
  const blockIndexes = Array.from({ length: blockCount }, (_, blockIndex) => blockIndex);
  return (
    <g>
      {blockIndexes.map((blockIndex) => (
        <rect
          key={blockIndex}
          x={blocksStartX + blockIndex * (blockWidth + blockGap)}
          y={region.y + 2.5}
          width={blockWidth}
          height={region.height - 5}
          strokeWidth={0.4}
          className="fill-landing-hero/50 stroke-landing-light"
        />
      ))}
    </g>
  );
}

/** The page's floating "?" button, drawn as itself rather than as a labelled box. */
function HelpButtonSketch({ region }: { region: TutorialMapRegion }) {
  return (
    <text
      x={region.x + region.width / 2}
      y={region.y + region.height / 2 + 2.2}
      textAnchor="middle"
      fontSize={6}
      className="fill-landing-ink font-display"
    >
      ?
    </text>
  );
}

/** A page title, and a line or two of intro text under it. */
function PageHeaderSketch({ region }: { region: TutorialMapRegion }) {
  const textTop = region.y + SKETCH_TOP + 1;
  return (
    <g>
      <rect x={region.x + 3} y={textTop} width={region.width * 0.35} height={3} className="fill-landing-ink/70" />
      {region.height > 18 && (
        <rect x={region.x + 3} y={textTop + 5} width={region.width * 0.7} height={1.4} className="fill-landing-light" />
      )}
      {region.height > 22 && (
        <rect x={region.x + 3} y={textTop + 8} width={region.width * 0.55} height={1.4} className="fill-landing-light" />
      )}
    </g>
  );
}

/** A search box and a short row of filter controls beside it. */
function FiltersSketch({ region }: { region: TutorialMapRegion }) {
  const controlY = region.y + Math.max(SKETCH_TOP, region.height - 8);
  const searchWidth = region.width * 0.42;
  const controlWidth = (region.width - searchWidth - 6 - 3 * 2) / 3;
  const controlIndexes = [0, 1, 2];
  return (
    <g>
      <rect
        x={region.x + 3}
        y={controlY}
        width={searchWidth}
        height={5}
        strokeWidth={0.4}
        className="fill-landing-hero/50 stroke-landing-light"
      />
      {controlIndexes.map((controlIndex) => (
        <rect
          key={controlIndex}
          x={region.x + 3 + searchWidth + 2 + controlIndex * (controlWidth + 2)}
          y={controlY}
          width={controlWidth}
          height={5}
          strokeWidth={0.4}
          className="fill-landing-hero/50 stroke-landing-light"
        />
      ))}
    </g>
  );
}

/** A row of tabs, the first one selected. */
function TabsSketch({ region }: { region: TutorialMapRegion }) {
  const tabCount = 4;
  const tabWidth = Math.min(18, (region.width - 6 - 1.5 * (tabCount - 1)) / tabCount);
  const tabY = region.y + Math.max(SKETCH_TOP, region.height - 7);
  const tabIndexes = Array.from({ length: tabCount }, (_, tabIndex) => tabIndex);
  return (
    <g>
      {tabIndexes.map((tabIndex) => (
        <rect
          key={tabIndex}
          x={region.x + 3 + tabIndex * (tabWidth + 1.5)}
          y={tabY}
          width={tabWidth}
          height={4.5}
          strokeWidth={0.4}
          className={tabIndex === 0 ? "fill-landing-ink stroke-landing-ink" : "fill-landing-hero/50 stroke-landing-light"}
        />
      ))}
    </g>
  );
}

/** A dark header row over striped data rows, as many as fit. */
function TableSketch({ region }: { region: TutorialMapRegion }) {
  const tableX = region.x + 3;
  const tableWidth = region.width - 6;
  const headerY = region.y + SKETCH_TOP;
  // As many rows as fit under the header, none in a region too short for
  // one — the header alone still reads as a table.
  const rowCount = Math.max(0, Math.floor((region.height - SKETCH_TOP - 7.4) / 3.5) + 1);
  const rowIndexes = Array.from({ length: rowCount }, (_, rowIndex) => rowIndex);
  return (
    <g>
      <rect x={tableX} y={headerY} width={tableWidth} height={3} className="fill-landing-ink/70" />
      {rowIndexes.map((rowIndex) => (
        <rect
          key={rowIndex}
          x={tableX}
          y={headerY + 4 + rowIndex * 3.5}
          width={tableWidth}
          height={2.4}
          className={rowIndex % 2 === 0 ? "fill-landing-light/70" : "fill-landing-light/40"}
        />
      ))}
    </g>
  );
}

/** Two axes, with a line plotted across them. */
function ChartSketch({ region }: { region: TutorialMapRegion }) {
  const plotLeft = region.x + 5;
  const plotRight = region.x + region.width - 4;
  const plotTop = region.y + SKETCH_TOP;
  const plotBottom = region.y + region.height - 3;
  const plotHeight = plotBottom - plotTop;
  const pointSpacing = (plotRight - plotLeft) / (CHART_LINE_SHARES.length - 1);
  const linePoints = CHART_LINE_SHARES.map(
    (share, pointIndex) => `${plotLeft + pointIndex * pointSpacing},${plotBottom - share * plotHeight}`
  ).join(" ");
  return (
    <g>
      <polyline
        points={`${plotLeft},${plotTop} ${plotLeft},${plotBottom} ${plotRight},${plotBottom}`}
        fill="none"
        strokeWidth={0.4}
        className="stroke-landing-light"
      />
      <polyline points={linePoints} fill="none" strokeWidth={0.7} className="stroke-locker-model" />
    </g>
  );
}

/** A short bar chart. */
function BarsSketch({ region }: { region: TutorialMapRegion }) {
  const plotLeft = region.x + 5;
  const plotBottom = region.y + region.height - 3;
  const plotHeight = plotBottom - (region.y + SKETCH_TOP);
  const barSlot = (region.width - 9) / BAR_SHARES.length;
  return (
    <g>
      {BAR_SHARES.map((share, barIndex) => (
        <rect
          key={barIndex}
          x={plotLeft + barIndex * barSlot + barSlot * 0.15}
          y={plotBottom - share * plotHeight}
          width={barSlot * 0.7}
          height={share * plotHeight}
          className={barIndex === 3 ? "fill-locker-leather" : "fill-landing-light"}
        />
      ))}
    </g>
  );
}

/** A grid of small cards, as many as the region has room for. */
function CardGridSketch({ region }: { region: TutorialMapRegion }) {
  const innerWidth = region.width - 6;
  const innerHeight = region.height - SKETCH_TOP - 3;
  const columnCount = Math.max(1, Math.floor((innerWidth + GRID_GAP) / (MIN_GRID_CARD_WIDTH + GRID_GAP)));
  const rowCount = Math.max(1, Math.floor((innerHeight + GRID_GAP) / (MIN_GRID_CARD_HEIGHT + GRID_GAP)));
  const cardWidth = (innerWidth - GRID_GAP * (columnCount - 1)) / columnCount;
  const cardHeight = (innerHeight - GRID_GAP * (rowCount - 1)) / rowCount;
  const cardIndexes = Array.from({ length: columnCount * rowCount }, (_, cardIndex) => cardIndex);
  return (
    <g>
      {cardIndexes.map((cardIndex) => {
        const cardX = region.x + 3 + (cardIndex % columnCount) * (cardWidth + GRID_GAP);
        const cardY = region.y + SKETCH_TOP + Math.floor(cardIndex / columnCount) * (cardHeight + GRID_GAP);
        return (
          <g key={cardIndex}>
            <rect
              x={cardX}
              y={cardY}
              width={cardWidth}
              height={cardHeight}
              strokeWidth={0.4}
              className="fill-landing-hero/50 stroke-landing-light"
            />
            <circle cx={cardX + 3} cy={cardY + 3} r={1.4} className="fill-landing-light" />
            <rect x={cardX + 5.5} y={cardY + 2.4} width={cardWidth * 0.45} height={1.2} className="fill-landing-light" />
          </g>
        );
      })}
    </g>
  );
}

/** Labelled inputs, with the form's submit button under them. */
function FormSketch({ region }: { region: TutorialMapRegion }) {
  // Up to four fields, as many as fit above the button — none in a region
  // too short for one, where the button alone stands for the form.
  const fieldCount = Math.max(0, Math.min(4, Math.floor((region.height - SKETCH_TOP - 5.5) / 7)));
  const fieldIndexes = Array.from({ length: fieldCount }, (_, fieldIndex) => fieldIndex);
  const fieldWidth = Math.min(region.width - 6, 60);
  const buttonY = region.y + SKETCH_TOP + fieldCount * 7 + 0.5;
  return (
    <g>
      {fieldIndexes.map((fieldIndex) => {
        const fieldY = region.y + SKETCH_TOP + fieldIndex * 7;
        return (
          <g key={fieldIndex}>
            <rect x={region.x + 3} y={fieldY} width={10} height={1.2} className="fill-landing-light" />
            <rect
              x={region.x + 3}
              y={fieldY + 2}
              width={fieldWidth}
              height={3.6}
              strokeWidth={0.4}
              className="fill-landing-hero/50 stroke-landing-light"
            />
          </g>
        );
      })}
      <rect x={region.x + 3} y={buttonY} width={16} height={4} className="fill-landing-ink" />
    </g>
  );
}

/** A half-court diagram: the floor, the key and the three-point arc. */
function CourtSketch({ region }: { region: TutorialMapRegion }) {
  const courtTop = region.y + SKETCH_TOP;
  const courtHeight = region.height - SKETCH_TOP - 3;
  const courtWidth = Math.min(region.width - 6, courtHeight * 1.6);
  const courtLeft = region.x + (region.width - courtWidth) / 2;
  const middleX = courtLeft + courtWidth / 2;
  const keyWidth = courtWidth * 0.3;
  const arcRadius = courtWidth * 0.4;
  return (
    <g fill="none" strokeWidth={0.5} className="stroke-locker-leather">
      <rect x={courtLeft} y={courtTop} width={courtWidth} height={courtHeight} className="fill-locker-leather/10" />
      <rect x={middleX - keyWidth / 2} y={courtTop} width={keyWidth} height={courtHeight * 0.55} />
      <path
        d={`M ${middleX - arcRadius} ${courtTop} A ${arcRadius} ${arcRadius} 0 0 0 ${middleX + arcRadius} ${courtTop}`}
      />
    </g>
  );
}

function RegionSketch({ region }: { region: TutorialMapRegion }) {
  switch (region.sketch) {
    case "matchup":
      return <MatchupSketch region={region} />;
    case "player-cards":
      return <PlayerCardsSketch region={region} />;
    case "rows":
      return <RowsSketch region={region} />;
    case "value":
      return <ValueSketch region={region} />;
    case "stat-blocks":
      return <StatBlocksSketch region={region} />;
    case "page-header":
      return <PageHeaderSketch region={region} />;
    case "filters":
      return <FiltersSketch region={region} />;
    case "tabs":
      return <TabsSketch region={region} />;
    case "table":
      return <TableSketch region={region} />;
    case "chart":
      return <ChartSketch region={region} />;
    case "bars":
      return <BarsSketch region={region} />;
    case "card-grid":
      return <CardGridSketch region={region} />;
    case "form":
      return <FormSketch region={region} />;
    case "court":
      return <CourtSketch region={region} />;
    case "help-button":
      return <HelpButtonSketch region={region} />;
  }
}

interface MapRegionProps {
  region: TutorialMapRegion;
  isActive: boolean;
  isDimmed: boolean;
}

function MapRegion({ region, isActive, isDimmed }: MapRegionProps) {
  return (
    <g
      data-region-id={region.id}
      data-active={isActive || undefined}
      className={cn(
        "transition-opacity duration-300 motion-reduce:transition-none",
        isDimmed ? "opacity-45" : "opacity-100"
      )}
    >
      <rect
        x={region.x}
        y={region.y}
        width={region.width}
        height={region.height}
        strokeWidth={isActive ? 1.2 : 0.5}
        className={isActive ? "fill-locker-leather/10 stroke-locker-leather" : "fill-locker-surface stroke-landing-light"}
      />
      {region.sketch !== "help-button" && (
        <text
          x={region.x + LABEL_INSET_X}
          y={region.y + LABEL_BASELINE_Y}
          fontSize={LABEL_FONT_SIZE}
          letterSpacing={0.4}
          className={cn("font-display uppercase", isActive ? "fill-locker-leather" : "fill-locker-ink-muted")}
        >
          {region.label}
        </text>
      )}
      <RegionSketch region={region} />
    </g>
  );
}

interface TutorialPageMapProps {
  /** The page's name as it reads mid-sentence, for the map's accessible name. */
  pageName: string;
  regions: TutorialMapRegion[];
  /** The region the current step is about, or null to outline the whole page. */
  activeRegionId: string | null;
  /** The current step's number, shown in its badge — 1-based, as the user counts. */
  stepNumber: number;
}

/**
 * A drawn picture of the page the tutorial is about: its header, each of its
 * sections roughly where they really sit, and — for the current step — that
 * section highlighted, with a numbered badge and an arrow pointing into it.
 *
 * It is a schematic rather than a screenshot on purpose. A screenshot goes
 * stale the moment a section moves or is dropped (the one this app had still
 * showed two sections the home page no longer renders), shows one user's data
 * to everyone, and can't highlight anything. This is drawn from the same
 * definition as the steps, so the two can never disagree.
 */
export function TutorialPageMap({ pageName, regions, activeRegionId, stepNumber }: TutorialPageMapProps) {
  const titleId = useId();
  const arrowheadId = useId();
  const activeRegion = regions.find((region) => region.id === activeRegionId);
  const callout = activeRegion ? computeCallout(activeRegion) : null;
  const frameRight = TUTORIAL_PAGE_FRAME.x + TUTORIAL_PAGE_FRAME.width;
  const navLinkIndexes = [0, 1, 2, 3, 4];

  return (
    <svg
      viewBox={`0 0 ${TUTORIAL_MAP_WIDTH} ${TUTORIAL_MAP_HEIGHT}`}
      role="img"
      aria-labelledby={titleId}
      className="h-auto w-full"
    >
      <title id={titleId}>
        {activeRegion
          ? `Map of the ${pageName} page, with ${activeRegion.label} highlighted`
          : `Map of the ${pageName} page`}
      </title>
      <defs>
        <marker
          id={arrowheadId}
          viewBox="0 0 6 6"
          refX={5}
          refY={3}
          markerWidth={3.6}
          markerHeight={3.6}
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M 0 0 L 6 3 L 0 6 Z" className="fill-locker-leather" />
        </marker>
      </defs>

      <rect
        x={TUTORIAL_PAGE_FRAME.x}
        y={TUTORIAL_PAGE_FRAME.y}
        width={TUTORIAL_PAGE_FRAME.width}
        height={TUTORIAL_PAGE_FRAME.height}
        strokeWidth={activeRegion ? 0.5 : 1.4}
        className={cn("fill-landing-hero", activeRegion ? "stroke-landing-light" : "stroke-locker-leather")}
      />
      <rect
        x={TUTORIAL_PAGE_FRAME.x}
        y={TUTORIAL_PAGE_FRAME.y}
        width={TUTORIAL_PAGE_FRAME.width}
        height={TUTORIAL_HEADER_HEIGHT}
        className="fill-landing-ink"
      />
      <circle
        cx={TUTORIAL_PAGE_FRAME.x + 5}
        cy={TUTORIAL_PAGE_FRAME.y + TUTORIAL_HEADER_HEIGHT / 2}
        r={2}
        className="fill-brand-accent"
      />
      {navLinkIndexes.map((linkIndex) => (
        <rect
          key={linkIndex}
          x={TUTORIAL_PAGE_FRAME.x + 12 + linkIndex * 11}
          y={TUTORIAL_PAGE_FRAME.y + TUTORIAL_HEADER_HEIGHT / 2 - 0.5}
          width={8}
          height={1}
          className="fill-white/50"
        />
      ))}
      <circle
        cx={frameRight - 5}
        cy={TUTORIAL_PAGE_FRAME.y + TUTORIAL_HEADER_HEIGHT / 2}
        r={2}
        className="fill-white/60"
      />

      {regions.map((region) => (
        <MapRegion
          key={region.id}
          region={region}
          isActive={region.id === activeRegionId}
          isDimmed={activeRegion !== undefined && region.id !== activeRegionId}
        />
      ))}

      {callout && (
        // Keyed on the step so each step's pointer draws in afresh, which is
        // what makes moving between steps read as the pointer travelling.
        <g key={stepNumber} aria-hidden className="animate-tutorial-fade-in motion-reduce:animate-none">
          <path
            d={callout.arrowPath}
            fill="none"
            strokeWidth={1.1}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            markerEnd={`url(#${arrowheadId})`}
            className="animate-tutorial-arrow-draw stroke-locker-leather motion-reduce:animate-none"
          />
          <circle cx={callout.badge.x} cy={callout.badge.y} r={BADGE_RADIUS} className="fill-locker-leather" />
          <text
            x={callout.badge.x}
            y={callout.badge.y + 1.9}
            textAnchor="middle"
            fontSize={5.4}
            className="fill-white font-mono font-bold"
          >
            {stepNumber}
          </text>
        </g>
      )}
    </svg>
  );
}
