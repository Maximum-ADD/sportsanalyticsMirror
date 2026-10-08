import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The compare page tutorial: what the page is for, then one step per section
// in the order a reader meets them — the header with its season segment
// control, the player slots, the stat table, the trait radar beside it and
// the glossary at the foot — and last, where to find the tutorial again.
//
// The map mirrors ComparePage's own layout at desktop width: the header card
// full width, then a main column (the player slots over the stat groups)
// with the 20rem Trait radar sidebar beside it, and the glossary full width
// below. The stat table, radar and glossary only appear once players are
// picked, which the steps say. Moving a section on the page means moving its
// region here too.
//
// Everything a step says has to be true of the page as built — no promised
// feature (there is no way to save a comparison from this page), and no
// figure that the server decides: those change without this file knowing.

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const COMPARE_TUTORIAL_ID = "compare";

// Map units — see lib/pageTutorial.ts. The page frame's content area runs
// x 36-184; the main column takes 36-144 and the radar sidebar 148-184.
const COMPARE_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "segments",
    label: "Player comparison",
    x: 36,
    y: 18,
    width: 148,
    height: 16,
    sketch: "tabs",
    calloutSide: "left",
  },
  {
    id: "player-slots",
    label: "Players",
    x: 36,
    y: 37,
    width: 108,
    height: 20,
    sketch: "player-cards",
    calloutSide: "left",
  },
  {
    id: "stat-table",
    label: "Stat table",
    x: 36,
    y: 60,
    width: 108,
    height: 36,
    sketch: "table",
    calloutSide: "left",
  },
  {
    id: "trait-radar",
    label: "Trait radar",
    x: 148,
    y: 37,
    width: 36,
    height: 59,
    sketch: "bars",
    calloutSide: "right",
  },
  {
    id: "glossary",
    label: "Glossary",
    x: 36,
    y: 99,
    width: 148,
    height: 20,
    sketch: "rows",
    calloutSide: "left",
  },
  // Last, so it is drawn over the glossary's corner the way the real button
  // floats over the bottom of the page.
  {
    id: "help-button",
    label: "Tutorial button",
    x: 177,
    y: 111,
    width: 9,
    height: 9,
    sketch: "help-button",
    calloutSide: "right",
  },
];

const COMPARE_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "Players side by side",
    summary:
      "Compare puts up to four players next to each other on the same figures, so you can see who leads where at a glance.",
    points: [
      "This tutorial points out each section of the page in turn, with what it shows and what you can do there.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "segments",
    title: "Pick a season segment",
    summary:
      "Regular, Play-In, Playoffs and Finals are kept apart. Every player is compared on their averages for the segment you pick.",
    points: [
      // Not "this season": the comparison averages every game held for each
      // player in the segment (StatsService.getPlayerStatsBatch filters on
      // seasonType only), earlier seasons included.
      "Those averages cover every game we hold for the player in that segment, across all the seasons we hold.",
      "Coming here with Compare on a player's page keeps the segment you were looking at there.",
    ],
  },
  {
    regionId: "player-slots",
    title: "Pick your players",
    summary: "Each column is one player. Two empty slots are waiting when you start.",
    points: [
      "Type a name into an empty slot's Select player box. Before you type, it suggests players — when you're signed in, the ones you follow come first.",
      "Add another player opens another slot, up to four. The ✕ on a player's card takes them out.",
      "The players you pick are kept in the page's address, so you can bookmark or share a comparison.",
    ],
  },
  {
    regionId: "stat-table",
    title: "The stat table",
    summary:
      "Once two players are picked, their figures line up in groups: general details, games, points, rebounds and assists, defense, and efficiency.",
    points: [
      "The best figure in each row is highlighted. For turnovers and defensive rating, the lowest wins.",
      "The shaded bar behind each figure shows its size against the biggest one in the row.",
      "Shooting rows read made / attempted per game, with the accuracy in brackets. A dash means that figure isn't available for the player yet.",
    ],
  },
  {
    regionId: "trait-radar",
    title: "Trait radar",
    summary:
      "Scoring, rebounding, playmaking, defense and efficiency for every player, each on a 0 to 100 scale — the same traits a player's own page shows.",
    points: [
      "Two players share one chart. With three or four, each player gets a small chart of their own so no one is hidden.",
      "Click a trait's name to see every player's real figures behind it.",
    ],
  },
  {
    regionId: "glossary",
    title: "Glossary",
    summary: "Plain-English meanings for the shorthand the table and radar use.",
    points: ["It covers TS%, eFG%, usage, assist-to-turnover ratio, +/- and the offensive and defensive ratings."],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole page. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const COMPARE_TUTORIAL: PageTutorialDefinition = {
  id: COMPARE_TUTORIAL_ID,
  pageName: "compare",
  regions: COMPARE_TUTORIAL_REGIONS,
  steps: COMPARE_TUTORIAL_STEPS,
};
