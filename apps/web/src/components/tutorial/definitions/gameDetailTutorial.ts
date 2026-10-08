import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The game page tutorial: what the page is for, then one step per section top
// to bottom — the matchup line (with the Back button above it), the three
// prediction tiles, the court and the player panel beside it, Fantasy watch
// and the player cards — and last, where to find the tutorial again.
//
// The map mirrors GameDetailPage's own layout at desktop (xl) width: the
// tiles in a 3-column row, the court beside a 20rem player panel, and
// Fantasy watch and the player cards full width under them. Moving a section
// on the page means moving its region here too.
//
// Everything a step says has to be true of the page as built — no promised
// feature, and no figure that the server decides (how many past games a
// prediction reads, how many scorers each team gets): those live in
// GameDetailService and change without this file knowing.

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const GAME_DETAIL_TUTORIAL_ID = "game-detail";

// Map units — see lib/pageTutorial.ts. The page frame's content area runs
// x 36-184; the court takes 36-140 and the player panel 144-184.
const GAME_DETAIL_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "matchup",
    label: "Matchup",
    x: 36,
    y: 18,
    width: 148,
    height: 11,
    sketch: "rows",
    calloutSide: "left",
  },
  {
    id: "predictions",
    label: "Win chances",
    x: 36,
    y: 32,
    width: 148,
    height: 13,
    sketch: "stat-blocks",
    calloutSide: "right",
  },
  {
    id: "court",
    label: "Predicted top scorers",
    x: 36,
    y: 48,
    width: 104,
    height: 30,
    sketch: "court",
    calloutSide: "left",
  },
  {
    id: "player-panel",
    label: "Player panel",
    x: 144,
    y: 48,
    width: 40,
    height: 30,
    sketch: "rows",
    calloutSide: "right",
  },
  {
    id: "fantasy-watch",
    label: "Fantasy watch",
    x: 36,
    y: 81,
    width: 148,
    height: 18,
    sketch: "bars",
    calloutSide: "left",
  },
  {
    id: "player-cards",
    label: "Player cards",
    x: 36,
    y: 102,
    width: 148,
    height: 18,
    sketch: "player-cards",
    calloutSide: "left",
  },
  // Last, so it is drawn over the player cards' corner the way the real
  // button floats over the bottom of the page.
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

const GAME_DETAIL_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "Welcome to the game page",
    summary:
      "Everything the app predicts for one NBA game: who should win, by how much, and which players should score the most.",
    points: [
      "This tutorial points out each section of the page in turn, with what it shows and what you can do there.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "matchup",
    title: "The matchup",
    summary: "The two teams, away team first and home team after the @.",
    points: [
      "Once the game has been played, the final score shows on the right.",
      "Back above it returns you to the page you came from, or to Predictions if you came straight here.",
    ],
  },
  {
    regionId: "predictions",
    title: "Win chances and margin",
    summary: "Three pre-game forecasts side by side. A dash means there's no figure for this game yet.",
    points: [
      // GamePrediction.homeWinProbability is Elo-only (apps/predictor/elo.py).
      "Win probability is the model's pick and how likely it thinks that team is to win. It comes from Elo, a team-strength rating that rises with wins and falls with losses.",
      // predictedMarginHome is the Four Factors model (four_factors.py).
      "Predicted margin is which team the model expects to win and by how many points, built from the Four Factors: shooting, turnovers, rebounding and free throws. It's marked low confidence — treat it as a rough guide.",
      "Market win probability is the betting market's view, averaged across bookmakers, with how many it's based on. It's a benchmark from outside the app, not our model.",
    ],
  },
  {
    regionId: "court",
    title: "Predicted top scorers",
    summary: "Each team's predicted top scorers, set out on a court.",
    points: [
      // GameDetailService.predictPointsFromRecentGames: regular-season games
      // strictly before this one, recency-weighted. The cap on how many games
      // it reads is the server's, so it isn't quoted here.
      "Predicted points are an average of the player's points in their most recent regular-season games before this one, with the latest games counting most.",
      "Players are placed by position — guards out front, forwards in the middle, centers near the rim. It's an illustration, not where they'll really stand.",
      "Click a player to open their details.",
    ],
  },
  {
    regionId: "player-panel",
    title: "Player details",
    summary: "The player you clicked: their predicted points for this game, and their averages beside it.",
    points: [
      "Games used is how many past games the prediction was built from. Fewer games means a shakier number.",
      "Prediction reliability counts how many of the player's recent games landed close to this prediction. High means a steady scorer; low means their scoring swings from game to game.",
      // The override lives in GameDetailPage's local state only.
      "Edit lets you try your own predicted points. It isn't saved and doesn't change the win chances or margin — Reset edited points puts the predictions back.",
      "Full player profile opens the player's own page.",
    ],
  },
  {
    regionId: "fantasy-watch",
    title: "Fantasy watch",
    summary: "The players predicted to score the most in this game — a starting point for a fantasy lineup.",
    points: [
      "Each pick shows how many games its prediction used. A pick built on only a few games can swing hard either way.",
      "A Reliable tag marks a player whose recent scoring has mostly landed close to this prediction.",
      "The bar chart shows every predicted top scorer's points, coloured by team. Click a pick to open their details.",
    ],
  },
  {
    regionId: "player-cards",
    title: "Player cards",
    summary: "Standout picks for this game, from the same predicted points and reliability shown above.",
    points: [
      "Man of the match is the highest predicted scorer. Consistency pick is the player whose prediction reliability is highest.",
      "A card is left out when there isn't enough data to back it.",
    ],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole page. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const GAME_DETAIL_TUTORIAL: PageTutorialDefinition = {
  id: GAME_DETAIL_TUTORIAL_ID,
  pageName: "game",
  regions: GAME_DETAIL_TUTORIAL_REGIONS,
  steps: GAME_DETAIL_TUTORIAL_STEPS,
};
