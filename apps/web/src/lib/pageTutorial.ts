// The shape of a page tutorial: the walkthrough a page opens by itself the
// first time a user visits it (see usePageTutorial and PageTutorial), built
// from a picture of the page — the map — and one step per section of it.
//
// A tutorial is plain data so a page gains one by writing a definition (see
// components/home/homeTutorial.ts) rather than a component. Everything a
// definition describes about the map is in map units: the map is drawn in an
// SVG whose viewBox is TUTORIAL_MAP_WIDTH × TUTORIAL_MAP_HEIGHT, so a layout
// scales with the dialog and never needs measuring against the real page.

/** Width of the tutorial map's coordinate space, in map units. */
export const TUTORIAL_MAP_WIDTH = 220;

/** Height of the tutorial map's coordinate space, in map units. */
export const TUTORIAL_MAP_HEIGHT = 128;

/**
 * The drawn "browser window" every region sits inside, in map units. The
 * strips either side of it are left empty on purpose: they are where each
 * step's numbered badge sits, so its arrow can come in from outside the page
 * rather than covering a neighbouring section.
 */
export const TUTORIAL_PAGE_FRAME = { x: 32, y: 6, width: 156, height: 116 } as const;

/** Height of the dark header strip drawn across the top of the page frame, in map units. */
export const TUTORIAL_HEADER_HEIGHT = 8;

/** Which margin a step's badge sits in, and so which side its arrow comes in from. */
export type TutorialCalloutSide = "left" | "right";

/**
 * The placeholder content a region draws, so the map reads as that page and
 * not as a grid of empty boxes:
 *
 * - "matchup": a game headline, a win-chance bar and two team buttons
 * - "player-cards": three small player cards, each with a scoring line
 * - "rows": a short list of rows, as many as the region's height allows
 * - "value": one big figure with a trend line under it
 * - "stat-blocks": a row of headline figures
 * - "help-button": the page's floating "?" button itself
 */
export type TutorialRegionSketch = "matchup" | "player-cards" | "rows" | "value" | "stat-blocks" | "help-button";

/** One section of the page as the tutorial's map draws it. */
export interface TutorialMapRegion {
  /** Referenced by TutorialStep.regionId; unique within a tutorial. */
  id: string;
  /** Short name drawn on the region, e.g. "Saved shelf". */
  label: string;
  /** Left edge, in map units. */
  x: number;
  /** Top edge, in map units. */
  y: number;
  /** In map units. */
  width: number;
  /** In map units. */
  height: number;
  sketch: TutorialRegionSketch;
  calloutSide: TutorialCalloutSide;
}

/** One step of a tutorial: the section it points at and what it says about it. */
export interface TutorialStep {
  /** The region this step highlights, or null to outline the whole page (a welcome step). */
  regionId: string | null;
  title: string;
  /** What the section is, in a sentence or two. */
  summary: string;
  /** What it shows and what you can do there, one short point each. */
  points: string[];
}

/** Everything one page's tutorial needs: its map, its steps and how to refer to the page. */
export interface PageTutorialDefinition {
  /**
   * Stable id, stored on the user's account once they have seen the tutorial
   * (UserSeenTutorial.tutorialId) — a lowercase slug, which the API enforces.
   * Giving a reworked tutorial a new id is what shows it to everyone again.
   */
  id: string;
  /** The page's name as it reads mid-sentence, e.g. "home" in "Show the home page tutorial". */
  pageName: string;
  regions: TutorialMapRegion[];
  steps: TutorialStep[];
}

/**
 * How a tutorial was closed. Every one of them marks the tutorial seen, so it
 * never opens by itself again on that page — "skip-all" also stops tutorials
 * opening by themselves on every other page.
 */
export type TutorialCloseReason = "complete" | "skip" | "skip-all" | "exit";
