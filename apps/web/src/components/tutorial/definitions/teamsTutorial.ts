import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The teams list tutorial: what the page is for, then one step per section in
// the order a reader meets them — the header, the search and filter row, the
// team cards and the page controls under them — and last, where to find the
// tutorial again.
//
// The map mirrors TeamsListPage's own layout at desktop width: everything is
// one full-width column, with the cards in a 3-column grid. Moving a section
// on the page means moving its region here too.
//
// Everything a step says has to be true of the page as built — no promised
// feature, and no figure that the server decides. The page is open to
// signed-out visitors and only the "?" opens it for them, so anything that
// needs an account (Follow) says so.

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const TEAMS_TUTORIAL_ID = "teams";

// Map units — see lib/pageTutorial.ts. The page frame's content area runs
// x 36-184; the page controls stop short of the "?" button's corner.
const TEAMS_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "page-header",
    label: "Teams",
    x: 36,
    y: 18,
    width: 148,
    height: 18,
    sketch: "page-header",
    calloutSide: "left",
  },
  {
    id: "filters",
    label: "Search and filters",
    x: 36,
    y: 40,
    width: 148,
    height: 15,
    sketch: "filters",
    calloutSide: "right",
  },
  {
    id: "team-cards",
    label: "Team cards",
    x: 36,
    y: 59,
    width: 148,
    height: 44,
    sketch: "card-grid",
    calloutSide: "left",
  },
  {
    id: "pagination",
    label: "Pages",
    x: 36,
    y: 107,
    width: 134,
    height: 12,
    sketch: "rows",
    calloutSide: "left",
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

const TEAMS_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "Welcome to Teams",
    summary:
      "Every NBA franchise in one list, with each team's record and the Elo rating the app's prediction model uses.",
    points: [
      "This tutorial points out each section of the page in turn, with what it shows and what you can do there.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "page-header",
    title: "The page header",
    summary: "What this list is, and how much of it you're looking at.",
    points: [
      "The count on the right says how many teams are on screen, out of all the teams that match your search and filters.",
    ],
  },
  {
    regionId: "filters",
    title: "Search and filters",
    summary: "Narrow the list down and choose its order.",
    points: [
      "Search matches a team's city, name or abbreviation, such as LAL.",
      "Filter by conference (East or West) or by division.",
      "Sort by Elo rating, win % or name. The list starts sorted by Elo, highest first.",
    ],
  },
  {
    regionId: "team-cards",
    title: "Team cards",
    summary: "One card per team, with its conference and division under its name.",
    points: [
      // Not "this season": TeamsService.getTeamRecords counts every completed
      // game held for the team, with no season or season-type filter.
      "Record is wins and losses, and Win % the share of games won — across every completed game we hold for the team, earlier seasons and playoffs included.",
      "Elo is a team-strength rating that rises with wins and falls with losses. It's the rating the model used for the team's most recent predicted game.",
      "The W and L squares are the team's latest results, oldest on the left. Click a card to open that team's page.",
      // FollowTeamButton renders nothing signed out, and writes the single
      // User.favoriteTeamId — following another team replaces the first.
      "When you're signed in, Follow makes it your team, shown under Your team on your home page. You follow one team at a time, so following another replaces it.",
    ],
  },
  {
    regionId: "pagination",
    title: "More teams",
    summary: "The list is shown a page at a time.",
    // LockerPagination's own labels: "Prev", "Next" and the page numbers.
    points: ["Use Prev, Next or a page number under the cards to see the rest."],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole page. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const TEAMS_TUTORIAL: PageTutorialDefinition = {
  id: TEAMS_TUTORIAL_ID,
  pageName: "teams",
  regions: TEAMS_TUTORIAL_REGIONS,
  steps: TEAMS_TUTORIAL_STEPS,
};
