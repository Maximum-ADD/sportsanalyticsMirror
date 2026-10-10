import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The team profile tutorial: what the page is for, then one step per section
// top to bottom — the header (with the Back button above it), the record and
// Elo row along its foot, the roster table and the injuries beside it — and
// last, where to find the tutorial again.
//
// The map mirrors TeamProfilePage's own layout at desktop width: the header
// card full width, with its stat row drawn as its own region so it can be
// pointed at on its own, then the roster in the left seven twelfths and the
// injuries in the other five. Moving a section on the page means moving its
// region here too.
//
// Everything a step says has to be true of the page as built — no promised
// feature, and no figure that the server decides. The page is open to
// signed-out visitors and only the "?" opens it for them, so anything that
// needs an account (Follow) says so.

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const TEAM_PROFILE_TUTORIAL_ID = "team-profile";

// Map units — see lib/pageTutorial.ts. The page frame's content area runs
// x 36-184; the roster takes 36-118 and runs to the foot of the page, and the
// injuries take 124-184, stopping short of the "?" button.
const TEAM_PROFILE_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "team-header",
    label: "Team header",
    x: 36,
    y: 18,
    width: 148,
    height: 20,
    sketch: "page-header",
    calloutSide: "left",
  },
  {
    id: "team-stats",
    label: "Record and Elo",
    x: 36,
    y: 40,
    width: 148,
    height: 13,
    sketch: "stat-blocks",
    calloutSide: "right",
  },
  {
    id: "roster",
    label: "Roster",
    x: 36,
    y: 58,
    width: 82,
    height: 61,
    sketch: "table",
    calloutSide: "left",
  },
  {
    id: "injuries",
    label: "Injuries",
    x: 124,
    y: 58,
    width: 60,
    height: 48,
    sketch: "rows",
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

const TEAM_PROFILE_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "Welcome to the team profile",
    summary: "One team's page: who they are, how they've been doing, and who plays for them.",
    points: [
      "This tutorial points out each section of the page in turn, with what it shows and what you can do there.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "team-header",
    title: "Team header",
    summary: "The team's name and badge, with its abbreviation, conference and division.",
    points: [
      "Back above it returns you to the page you came from, or to the teams list if you came straight here.",
      // FollowTeamButton renders nothing signed out, and writes the single
      // User.favoriteTeamId — following another team replaces the first.
      "When you're signed in, Follow makes this your team, shown under Your team on your home page. You follow one team at a time, so following another replaces it.",
    ],
  },
  {
    regionId: "team-stats",
    title: "Record and Elo",
    summary: "How the team has been doing, in three figures.",
    points: [
      // Not "this season": TeamsService.getTeamRecords counts every completed
      // game held for the team, with no season or season-type filter.
      "Record is wins and losses, and Win % the share of games won — across every completed game we hold for the team, earlier seasons and playoffs included.",
      "Elo is a team-strength rating that rises with wins and falls with losses. It's the rating the prediction model used for the team's most recent predicted game.",
    ],
  },
  {
    regionId: "roster",
    title: "Roster",
    summary: "The players on the team, with each one's position and jersey number.",
    points: [
      "Position is G for guard, F for forward and C for center. Some players have two, like G-F.",
      "Click a player's name to open their player page.",
    ],
  },
  {
    regionId: "injuries",
    title: "Injuries",
    summary: "The team's injured players, from ESPN's injury report, with those ruled out listed first.",
    points: [
      "Each shows whether they're out or day-to-day, the injury, and when ESPN expects them back. That date is ESPN's estimate, not an official one.",
      // InjuriesService caches ESPN's report for half an hour.
      "The report comes from ESPN, not the NBA, and can be up to half an hour behind ESPN's own site.",
      "A name you can click opens that player's page. Players the app doesn't hold yet, such as new signings, are listed without a link.",
    ],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole page. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const TEAM_PROFILE_TUTORIAL: PageTutorialDefinition = {
  id: TEAM_PROFILE_TUTORIAL_ID,
  pageName: "team profile",
  regions: TEAM_PROFILE_TUTORIAL_REGIONS,
  steps: TEAM_PROFILE_TUTORIAL_STEPS,
};
