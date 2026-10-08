import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The home page ("the locker") tutorial: what the page is for, then one step
// per module in the order a reader meets them — down the wide column, down
// the narrow one, then the published figures at the foot of the page — and
// last, where to find the tutorial again.
//
// The map mirrors HomePage's own layout at desktop width: a 12-column grid
// split 8/4, the wide column holding Beat the Model, the watchlist and your
// team, the narrow one the leaderboard, saved shelf and Become Pro card, with
// the model accuracy ledger full width below a rule. Moving a module on the
// page means moving its region here too.
//
// Everything a step says has to be true of the module as built — no
// promised feature, and no figure that the server decides (a qualifying
// call count, the minimum games for a valuation): those change without this
// file knowing.

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const HOME_TUTORIAL_ID = "home";

// Map units — see lib/pageTutorial.ts. The page frame's content area runs
// x 36-184; the wide column takes 36-132 and the narrow one 136-184.
const HOME_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "beat-the-model",
    label: "Beat the model",
    x: 36,
    y: 18,
    width: 96,
    height: 30,
    sketch: "matchup",
    calloutSide: "left",
  },
  {
    id: "watchlist",
    label: "Your watchlist",
    x: 36,
    y: 52,
    width: 96,
    height: 32,
    sketch: "player-cards",
    calloutSide: "left",
  },
  {
    id: "your-team",
    label: "Your team",
    x: 36,
    y: 88,
    width: 96,
    height: 14,
    sketch: "rows",
    calloutSide: "left",
  },
  {
    id: "leaderboard",
    label: "Leaderboard",
    x: 136,
    y: 18,
    width: 48,
    height: 24,
    sketch: "rows",
    calloutSide: "right",
  },
  {
    id: "saved-shelf",
    label: "Saved shelf",
    x: 136,
    y: 46,
    width: 48,
    height: 22,
    sketch: "rows",
    calloutSide: "right",
  },
  {
    id: "become-pro",
    label: "Become Pro",
    x: 136,
    y: 72,
    width: 48,
    height: 18,
    sketch: "value",
    calloutSide: "right",
  },
  {
    id: "model-ledger",
    label: "Model accuracy ledger",
    x: 36,
    y: 107,
    width: 148,
    height: 12,
    sketch: "stat-blocks",
    calloutSide: "left",
  },
  // Last, so it is drawn over the ledger's corner the way the real button
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

const HOME_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "Welcome to your locker",
    summary:
      "This is your home page: your own calls, the players and team you follow, and how the app's prediction model is really doing, all in one place.",
    points: [
      "This tutorial points out each section of the page in turn, with what it shows and what you can do there.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "beat-the-model",
    title: "Beat the model",
    summary:
      "A prediction game. You're shown a finished NBA game with the final score hidden — call who won, and you're graded against the real result and against the Elo model.",
    points: [
      "Click a team to make your call. Each game is only asked once, and a call can't be changed.",
      "The bar shows which team the model favoured and how likely it thought each side was to win. Elo is a team-strength rating that rises with wins and falls with losses.",
      "After your call you see the final score, whether you and the model got it right, and your record next to the model's. Next call brings up another game.",
    ],
  },
  {
    regionId: "watchlist",
    title: "Your watchlist",
    summary: "The players you follow, each on a card with their per-game averages and recent scoring.",
    points: [
      // Not "this season": the watchlist averages every game held for the
      // player (WatchlistService), earlier seasons and the postseason included.
      "PPG, RPG and APG are points, rebounds and assists per game, across every game we hold for that player — earlier seasons and playoffs included.",
      "The small line tracks points in recent games, oldest to newest — the dot is the latest game.",
      "Click a card to open that player's page. Remove unfollows them everywhere, and Add players takes you to the full list of players.",
    ],
  },
  {
    regionId: "your-team",
    title: "Your team",
    summary: "Recent results for the team you support, told from your team's side.",
    points: [
      "Each row has the final score, a W or L, and vs for a home game or at for an away one.",
      "It also shows the model's pre-game win chance for your team, with a tick or a cross once it's known whether the model called it right.",
      "Click a result to open the full game. You can change your team on your profile.",
    ],
  },
  {
    regionId: "leaderboard",
    title: "Accuracy leaderboard",
    summary: "Who calls game winners most accurately, ranked, with the Elo model listed as the benchmark to beat.",
    points: [
      "Accuracy is the share of a caller's calls that turned out right.",
      "Your Beat the model calls put you on the board once you've made enough to qualify — the note under the table says how many.",
      "The model's row covers every game it predicted, so for a like-for-like comparison on the same games, look at your record on the Beat the model card.",
    ],
  },
  {
    regionId: "saved-shelf",
    title: "Saved shelf",
    summary:
      "The player comparisons and fantasy lineups saved to your account, so you can get back to them without building them again.",
    points: [
      "Click a saved comparison to reopen it on Compare with the same players.",
      "Each lineup shows its projected points and salary from the day you saved it, and how its projection has moved since. Clicking one opens the Optimizer.",
      // Only lineups have a save control in the app today (the Optimizer's
      // Save lineup); Compare has none, so the tutorial must not send anyone
      // there to save a comparison.
      "Save a lineup with Save lineup on the Optimizer page. The shelf lists your five most recent comparisons and five most recent lineups.",
    ],
  },
  {
    regionId: "become-pro",
    title: "Become Pro",
    summary:
      "Your private Become Pro card: what a season you log yourself would be worth on the NBA rookie salary scale.",
    points: [
      "Once you've logged enough games, it shows your projected value and the draft pick your season projects to.",
      "It's built from games you enter yourself, and it compares you only with NBA rookies — never with other users.",
      "Start a season or log more games from here. The full breakdown is on the Become Pro page.",
    ],
  },
  {
    regionId: "model-ledger",
    title: "Model accuracy ledger",
    summary: "The prediction model's public scorecard. These figures are the same for every account.",
    points: [
      "Accuracy is how often the model's pick won. The baseline is what always picking the home team would score — the model has to beat it to mean anything.",
      "The Brier score measures how close its win chances were to what actually happened. Lower is better.",
      "The table checks calibration: whether teams given about 70% really win about 70% of the time. Ranges with too few games to trust are greyed out.",
    ],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole page. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const HOME_TUTORIAL: PageTutorialDefinition = {
  id: HOME_TUTORIAL_ID,
  pageName: "home",
  regions: HOME_TUTORIAL_REGIONS,
  steps: HOME_TUTORIAL_STEPS,
};
