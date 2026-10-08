import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The admin page tutorial: what the page is for, then the section buttons,
// the tools strip above each table, and one step per tab in tab order — and
// last, where to find the tutorial again.
//
// The map mirrors AdminPage's own layout at desktop width, which is a single
// full-width column: the header panel with the row of section buttons at its
// foot, then the selected tab — its search, filters and (on Batches) the pull
// controls first, its table under them. Only one tab is on screen at a time,
// so the tab steps all point at the same "Selected tab" region and each says
// which tab it is about, rather than drawing six panels the page never shows
// together. Adding or moving a tab means adding or moving its step here too.
//
// Everything a step says has to be true of the page as built — no promised
// feature, and nothing the server decides (rate limits, quotas, what a pull
// covers by default beyond what AdminPage itself says): those change without
// this file knowing.

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const ADMIN_TUTORIAL_ID = "admin";

// Map units — see lib/pageTutorial.ts. The page frame's content area runs
// x 36-184; every region here spans all of it, as the page is one column.
const ADMIN_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "sections",
    label: "Admin sections",
    x: 36,
    y: 18,
    width: 148,
    height: 18,
    sketch: "tabs",
    calloutSide: "left",
  },
  {
    id: "tools",
    label: "Search and tools",
    x: 36,
    y: 40,
    width: 148,
    height: 16,
    sketch: "filters",
    calloutSide: "left",
  },
  {
    id: "selected-tab",
    label: "Selected tab",
    x: 36,
    y: 60,
    width: 148,
    height: 59,
    sketch: "table",
    calloutSide: "left",
  },
  // Last, so it is drawn over the table's corner the way the real button
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

const ADMIN_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "Welcome to admin",
    summary:
      "This is where admins look after the app's data: the NBA teams and players it imports, user accounts, each game's imported play-by-play, fixes to it, and API keys.",
    points: [
      "Only admins can open this page. This tutorial points out each part of it in turn, with what it shows and what you can do there.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "sections",
    title: "One section at a time",
    summary:
      "The page shows one section at a time. These buttons switch between them: Teams, Players, Users, Batches, Corrections and API Keys.",
    points: [
      "The page opens on Teams. The rest of this tutorial takes the sections in that order.",
      "Most sections list their records in a table, with page controls under it.",
    ],
  },
  {
    regionId: "tools",
    title: "Search, filters and pulls",
    summary:
      "Above each section's table sit its search box and filters. On Batches, this is also where new games are pulled in from the NBA's stats site.",
    points: [
      "Pull Data starts a pull. Leave Season, From and To empty to pull the current season's recent games, or fill them in to pull a particular stretch.",
      "Schedule makes pulls run by themselves — hourly, daily or weekly — or Never, for manual only. Last run shows when one last ran.",
      "Where this server can't reach stats.nba.com, pulls are queued for a pull worker on another machine. The pull queue lists them, and a queued one can be cancelled.",
    ],
  },
  {
    regionId: "selected-tab",
    title: "Teams and players",
    summary: "The Teams and Players tabs list the imported NBA teams and players, so you can fix a detail the import got wrong.",
    points: [
      "Search for a team or player by name. On Players you can also filter by team.",
      "Edit opens a form above the table. Save writes the change to the record; Cancel leaves it as it was.",
      "A player can be moved to another team, or set as a free agent.",
    ],
  },
  {
    regionId: "selected-tab",
    title: "Users",
    summary: "The Users tab lists every account on the app. Search by email, name or username.",
    points: [
      "Make admin lets an account open this page; Remove admin takes that away.",
      // AdminUsersService.deleteUser: the account's follows, picks, saved
      // comparisons and lineups all cascade with it.
      "Delete removes the account and everything saved to it.",
      "Each asks you to confirm with a second click. Your own account is marked (you) and can't be changed here.",
    ],
  },
  {
    regionId: "selected-tab",
    title: "Reviewing batches",
    summary:
      "A pull brings each game in as a batch — that game's imported play-by-play. The Batches tab is where an admin checks each one before it goes public.",
    points: [
      // PUBLISHED_GAME_FILTER (api common/game-visibility.ts): a game with a
      // pending, running, failed or rejected batch is hidden from public reads.
      "A game stays off the public site while its batch is on Pending Review. Approve publishes it; Reject keeps it off. Add a note first if you want one kept with the review.",
      "The list starts on Pending Review batches; the status filter shows the rest. Click Date, Season or Ingested to sort.",
      "Correct plays opens that game on the Corrections tab. Delete removes the batch, once you confirm.",
    ],
  },
  {
    regionId: "selected-tab",
    title: "Corrections",
    summary:
      "The Corrections tab fixes a play that was recorded wrong — the wrong player, 2 points instead of 3, made instead of missed, the wrong assist.",
    points: [
      "Pick a game with Open plays, then Edit the play. Give a reason, check Preview changes, then Confirm and save. Plays can be edited, but not added or deleted.",
      "The game's player stats are worked out again from its plays straight away. The season's published dataset releases are marked out of date, so you can publish a new one on the Datasets page.",
      "Every correction is kept in the history below, with who made it and why. Undo reverses one, and asks for a reason too.",
    ],
  },
  {
    regionId: "selected-tab",
    title: "API keys",
    summary:
      "The API Keys tab manages who can read the app's data through its API. Each consumer — a person or app using the API — holds one or more keys.",
    points: [
      "Add a consumer with New Consumer, then Generate Key. The new key is shown once only, so copy it before you dismiss it.",
      "The table shows each consumer's rate limit, daily quota, usage and keys. A User key badge marks a consumer that belongs to a user's account; Admin key, one with no account behind it.",
      "Revoke switches a key off but keeps it listed. Delete removes a key for good, and deleting a consumer stops all its keys working at once.",
    ],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole page. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const ADMIN_TUTORIAL: PageTutorialDefinition = {
  id: ADMIN_TUTORIAL_ID,
  pageName: "admin",
  regions: ADMIN_TUTORIAL_REGIONS,
  steps: ADMIN_TUTORIAL_STEPS,
};
