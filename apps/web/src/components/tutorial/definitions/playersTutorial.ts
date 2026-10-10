import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The players list tutorial: what the page is for, then one step per band in
// the order a reader meets them — the header with its season segment
// control, the league leaders, the filter bar, the table — and last, where
// to find the tutorial again.
//
// The map mirrors PlayersListPage's own layout at desktop width: every band
// runs the full width of the page, stacked — the header card (title, intro
// and segment control), the four league-leader cards, the filter bar, then
// the players table with its pagination under it. Moving a band on the page
// means moving its region here too.
//
// Everything a step says has to be true of the page as built — no promised
// feature, and no figure that the server decides (the leaders' minimum
// games): those change without this file knowing.

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const PLAYERS_TUTORIAL_ID = "players";

// Map units — see lib/pageTutorial.ts. The page frame's content area runs
// x 36-184, and every band here spans all of it.
const PLAYERS_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "segments",
    label: "Players",
    x: 36,
    y: 18,
    width: 148,
    height: 18,
    sketch: "tabs",
    calloutSide: "left",
  },
  {
    id: "league-leaders",
    label: "League leaders",
    x: 36,
    y: 40,
    width: 148,
    height: 14,
    sketch: "stat-blocks",
    calloutSide: "right",
  },
  {
    id: "filters",
    label: "Filters",
    x: 36,
    y: 58,
    width: 148,
    height: 13,
    sketch: "filters",
    calloutSide: "left",
  },
  {
    id: "players-table",
    label: "Players table",
    x: 36,
    y: 75,
    width: 148,
    height: 33,
    sketch: "table",
    calloutSide: "right",
  },
  // Last, so it is drawn over the page's corner the way the real button
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

const PLAYERS_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "Find any player",
    summary:
      "This is the full list of players, ranked by scoring to start with, with each player's averages and recent form. Open any of them for the full picture.",
    points: [
      "This tutorial points out each section of the page in turn, with what it shows and what you can do there.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "segments",
    title: "Pick a season segment",
    summary:
      "Regular, Play-In, Playoffs and Finals are kept apart. Every figure on the page — the leaders and the table — is for the segment you pick.",
    points: [
      // Not "this season": the list's averages come from every game held for
      // the player in the segment (StatsService.getPlayerStatsBatch and the
      // ranked listing filter on seasonType only), earlier seasons included.
      "A player's averages cover every game we hold for them in that segment, across all the seasons we hold — not only the latest one.",
      "In a postseason segment, the list only shows players who actually appeared in it.",
    ],
  },
  {
    regionId: "league-leaders",
    title: "League leaders",
    summary: "The top player in four categories for the segment you picked, among the players your filters match.",
    points: [
      "The categories are points, rebounds and assists per game, and true shooting — a scoring-efficiency figure that counts threes and free throws.",
      // The band follows search, team, position and min games (see
      // leadersParams in PlayersListPage), but not Following.
      "Search, team and position narrow the leaders the same way they narrow the table, and the band's title names the filters it's following. With none set, they're the league's leaders. Following only narrows the table.",
      "Only players with enough games qualify. The minimum is shown at the right of the band, and matches the minimum games filter when you set one.",
      "Click a leader's name to open their page.",
    ],
  },
  {
    regionId: "filters",
    title: "Filter and sort",
    summary: "Narrow the table down and choose how it's ranked.",
    points: [
      "Search by name, or filter by team, position and a minimum number of games.",
      "Sort by name, points, rebounds, assists or true shooting, high to low or low to high. The whole list is ranked before it's split into pages, so the first page really is the top.",
      "When you're signed in, Following narrows the table to the players you follow.",
    ],
  },
  {
    regionId: "players-table",
    title: "The players table",
    summary: "One row per player, with their averages for the segment you picked.",
    points: [
      "PPG, RPG and APG are points, rebounds and assists per game. TS% is true shooting. Last 8 plots their points over their last eight games, oldest to newest.",
      "A dash means the player has no games in this segment, rather than a zero. On a narrower screen some columns are hidden to keep the numbers readable.",
      "Click a name to open the player's page, or a team to open the team's page. Move between pages with the controls under the table.",
      "When you're signed in, Follow adds a player to the watchlist on your home page.",
    ],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole page. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const PLAYERS_TUTORIAL: PageTutorialDefinition = {
  id: PLAYERS_TUTORIAL_ID,
  pageName: "players",
  regions: PLAYERS_TUTORIAL_REGIONS,
  steps: PLAYERS_TUTORIAL_STEPS,
};
