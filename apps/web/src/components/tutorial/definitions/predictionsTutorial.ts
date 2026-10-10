import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The Predictions page tutorial: what the page is for, then one step per
// section in the order a reader scrolls past them, and last, where to find
// the tutorial again.
//
// The map mirrors PredictionsPage's own layout at desktop width: Model
// highlights full width, then Recent results and Your matchups split 6/6,
// then the game cards (the search/season/segment filters sit on the same
// region, directly above the grid), Top 5 to watch, the model track record
// and the dark How it works band at the foot. The page's intro box above
// Model highlights is left off the map — it only restates what the welcome
// step says, and the map has no height to spare. Moving a section on the
// page means moving its region here too.
//
// Everything a step says has to be true of the page as built — no promised
// feature, and no figure the code or server decides (how many games are
// fetched, the reliability tolerance, a backtested error): those change
// without this file knowing.

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const PREDICTIONS_TUTORIAL_ID = "predictions";

// Map units — see lib/pageTutorial.ts. The page frame's content area runs
// x 36-184; the two half-width columns take 36-108 and 112-184.
const PREDICTIONS_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "model-highlights",
    label: "Model highlights",
    x: 36,
    y: 18,
    width: 148,
    height: 10,
    sketch: "stat-blocks",
    calloutSide: "left",
  },
  {
    id: "recent-results",
    label: "Recent results",
    x: 36,
    y: 31,
    width: 72,
    height: 20,
    sketch: "rows",
    calloutSide: "left",
  },
  {
    id: "your-matchups",
    label: "Your matchups",
    x: 112,
    y: 31,
    width: 72,
    height: 20,
    sketch: "player-cards",
    calloutSide: "right",
  },
  {
    id: "game-cards",
    label: "Game predictions",
    x: 36,
    y: 54,
    width: 148,
    height: 22,
    sketch: "card-grid",
    calloutSide: "left",
  },
  {
    id: "top-five",
    label: "Top 5 to watch",
    x: 36,
    y: 79,
    width: 148,
    height: 12,
    sketch: "stat-blocks",
    calloutSide: "right",
  },
  {
    id: "track-record",
    label: "Model track record",
    x: 36,
    y: 94,
    width: 148,
    height: 10,
    sketch: "stat-blocks",
    calloutSide: "left",
  },
  {
    id: "how-it-works",
    label: "How it works",
    x: 36,
    y: 107,
    width: 148,
    height: 12,
    sketch: "rows",
    calloutSide: "left",
  },
  // Last, so it is drawn over How it works' corner the way the real button
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

const PREDICTIONS_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "Welcome to Predictions",
    summary:
      "This page shows what the app's prediction model expects from NBA games: who should win, by how much, and how often it has been right.",
    points: [
      "This tutorial points out each section of the page in turn, with what it shows and what you can do there.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "model-highlights",
    title: "Model highlights",
    summary: "Three quick reads on what the model is saying right now.",
    points: [
      "Most anticipated is the upcoming game the model thinks is closest to a coin flip. Most confident pick is the one it is surest about.",
      "Best-rated team is the team with the highest Elo rating today. Elo is a team-strength rating that rises with wins and falls with losses.",
      "Click a game to open it, or the team to open its page.",
    ],
  },
  {
    regionId: "recent-results",
    title: "Recent results",
    summary: "The latest finished games, with whether the model picked the winner.",
    points: [
      "Each row shows the two teams and the final score, away team first.",
      "The pill says whether the model's pick won (a hit) or lost (a miss).",
      "Click a row to open the full game.",
    ],
  },
  {
    regionId: "your-matchups",
    title: "Your matchups",
    summary: "Upcoming games that matter to you: your team's next game, and the next games of players you follow.",
    points: [
      "Your team's card shows who the model favours and, once there are enough games, how often it has called your team's recent games right.",
      "Each followed player's card shows the points the model predicts for them in that game; clicking it opens their profile.",
      // YourMatchupsSection returns null without a team or followed player
      // that has an upcoming game, so the step has to say it can be missing.
      "It only appears once you support a team or follow players with an upcoming game. You can change both on your profile.",
    ],
  },
  {
    regionId: "game-cards",
    title: "Game predictions",
    summary: "One card per game, each with the model's win chance for both teams and its predicted winning margin.",
    points: [
      "Above the cards, search a team, pick a season, or pick part of a season such as the regular season or playoffs. Upcoming games is the default.",
      // Fitted vs textbook weights — see apps/predictor/four_factors.py.
      "The margin is a rough guide and much less reliable than the win chance. A heuristic tag means it used textbook weights, not ones fitted to the data.",
      // The models train on regular-season games only, so postseason cards
      // carry no prediction — the page says so above the grid.
      "Finished games show the final score and a hit or miss. Postseason games have no predictions. Click a card for the full game breakdown.",
    ],
  },
  {
    regionId: "top-five",
    title: "Top 5 to watch",
    summary: "Standout players from the soonest upcoming games, by the model's predicted points.",
    points: [
      "Man of the match is the highest predicted scorer. Consistency picks are the players whose recent scoring has stayed closest to their prediction.",
      "Reliability counts how many of a player's recent games landed close to the points predicted for them now.",
      "Each card's View profile link opens that player's page.",
    ],
  },
  {
    regionId: "track-record",
    title: "Model track record",
    summary: "How the model has done on the latest finished games.",
    points: [
      "Longest correct streak is its longest run of right calls in a row.",
      "When confident (70%+) is how often it was right when it gave one side at least a 70% chance.",
      "Most predictable team is the team whose games it has called right at the highest rate.",
    ],
  },
  {
    regionId: "how-it-works",
    title: "How it works",
    summary: "A plain-English guide to the two numbers on every card.",
    points: [
      "The win chance comes from Elo: the bigger the gap between two teams' ratings, the more lopsided the odds. The home team gets a bonus.",
      // four_factors.py uses all four offensive factors, offensive rebounds
      // included — the section's own copy names three, so this step doesn't
      // list them.
      "The margin comes from the Four Factors: comparing team habits such as efficient shooting, avoiding turnovers and getting to the free-throw line.",
      "Neither model knows about injuries, trades or rest. They only learn from games already played.",
    ],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole page. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const PREDICTIONS_TUTORIAL: PageTutorialDefinition = {
  id: PREDICTIONS_TUTORIAL_ID,
  pageName: "predictions",
  regions: PREDICTIONS_TUTORIAL_REGIONS,
  steps: PREDICTIONS_TUTORIAL_STEPS,
};
