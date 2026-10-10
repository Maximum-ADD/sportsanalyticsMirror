import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The all-time leaders page tutorial: what the page is for, then one step per
// section in the order a reader meets them — the header, the season type and
// category chips, the top-20 list and the selected player's bio card — and
// last, where to find the tutorial again.
//
// The map mirrors AllTimeLeadersPage at desktop width: the header and the
// chips full width, then the list in the left seven twelfths with the bio
// card in the remaining five beside it. Moving a section on the page means
// moving its region here too.
//
// Everything a step says has to be true of the page as built, and nothing
// states a figure the server decides. The page is open to signed-out
// visitors, and nothing on it needs an account.

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const ALL_TIME_LEADERS_TUTORIAL_ID = "all-time-leaders";

// Map units — see lib/pageTutorial.ts. The page frame's content area runs
// x 36-184; the list takes 36-122 and the bio card 128-184.
const ALL_TIME_LEADERS_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "page-header",
    label: "All-time leaders",
    x: 36,
    y: 18,
    width: 148,
    height: 14,
    sketch: "page-header",
    calloutSide: "left",
  },
  {
    id: "choices",
    label: "Season type and category",
    x: 36,
    y: 35,
    width: 148,
    height: 16,
    sketch: "tabs",
    calloutSide: "right",
  },
  {
    id: "leader-list",
    label: "Top 20",
    x: 36,
    y: 54,
    width: 86,
    height: 64,
    sketch: "rows",
    calloutSide: "left",
  },
  {
    id: "bio-card",
    label: "Player bio",
    x: 128,
    y: 54,
    width: 56,
    height: 40,
    sketch: "player-cards",
    calloutSide: "right",
  },
  // Last, so it is drawn over the page the way the real button floats over it.
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

const ALL_TIME_LEADERS_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "Welcome to all-time leaders",
    summary:
      "The top 20 career totals in each category across the NBA's whole history, not just the seasons the rest of the app holds.",
    points: [
      "This tutorial points out each section of the page in turn, with what it shows and what you can do there.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "page-header",
    title: "The page header",
    summary: "What the page shows, and when its figures were last updated.",
    points: [
      // apps/ingestion/all_time_leaders.py is run by hand, not on a schedule.
      "The totals come from the NBA's own records and are refreshed from time to time, so the latest games may not be counted yet.",
    ],
  },
  {
    regionId: "choices",
    title: "Choose a leaderboard",
    summary: "Pick regular-season or playoff totals, then a category.",
    points: [
      "The NBA keeps regular-season and playoff careers separately. Playoff totals include the Finals.",
      "Some categories were only recorded from a later season: steals, blocks and offensive and defensive rebounds from 1973-74, and 3-pointers from 1979-80. A note under the categories says so when one of them is picked.",
    ],
  },
  {
    regionId: "leader-list",
    title: "The top 20",
    summary: "Each row is a player's rank, photo, name and career total, best first.",
    points: [
      "Players with the same total share a rank.",
      "Active marks players still playing, whose totals can still grow.",
      "Choose a row to show that player's bio.",
    ],
  },
  {
    regionId: "bio-card",
    title: "Player bio",
    summary: "The selected player's details: the leader, until you choose someone else.",
    points: [
      "Position, height, weight, birth date, school or country, draft and the seasons they played. A dash means the NBA has no record of it.",
      "Players named to the NBA's 75th Anniversary Team are marked.",
      "When the app also holds the player, Open player profile takes you to their full page.",
    ],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole page. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const ALL_TIME_LEADERS_TUTORIAL: PageTutorialDefinition = {
  id: ALL_TIME_LEADERS_TUTORIAL_ID,
  pageName: "all-time leaders",
  regions: ALL_TIME_LEADERS_TUTORIAL_REGIONS,
  steps: ALL_TIME_LEADERS_TUTORIAL_STEPS,
};
