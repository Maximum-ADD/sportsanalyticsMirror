import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The Optimizer page tutorial: what the page is for, then one step per
// section in the order a reader meets them — the intro, the lineup totals,
// the edit controls, the lineup itself and the solver checks with the save
// button — and last, where to find the tutorial again.
//
// The map mirrors OptimizerPage's own layout at desktop width: a single
// column of full-width modules. "Edit lineup" stands for The lineup's
// heading row (Edit lineup and Reset) and the Suggested adds panel and
// player search that open under it while editing, drawn as its own region
// so the table below it gets a step of its own. Moving a section on the page
// means moving its region here too.
//
// Everything a step says has to be true of the page as built — no promised
// feature, and no figure the solver or server decides (the salary cap, a
// salary range): those change without this file knowing.

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const OPTIMIZER_TUTORIAL_ID = "optimizer";

// Map units — see lib/pageTutorial.ts. The page frame's content area runs
// x 36-184, and every module here spans all of it.
const OPTIMIZER_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "page-header",
    label: "Optimal lineup",
    x: 36,
    y: 18,
    width: 148,
    height: 19,
    sketch: "page-header",
    calloutSide: "left",
  },
  {
    id: "lineup-totals",
    label: "Lineup totals",
    x: 36,
    y: 40,
    width: 148,
    height: 12,
    sketch: "stat-blocks",
    calloutSide: "right",
  },
  {
    id: "edit-lineup",
    label: "Edit lineup",
    x: 36,
    y: 55,
    width: 148,
    height: 14,
    sketch: "filters",
    calloutSide: "left",
  },
  {
    id: "lineup-table",
    label: "The lineup",
    x: 36,
    y: 72,
    width: 148,
    height: 27,
    sketch: "table",
    calloutSide: "right",
  },
  {
    id: "solver-checks",
    label: "Solver checks",
    x: 36,
    y: 102,
    width: 148,
    height: 18,
    sketch: "rows",
    calloutSide: "left",
  },
  // Last, so it is drawn over the solver checks' corner the way the real
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

const OPTIMIZER_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "Welcome to the Optimizer",
    summary:
      "This page builds a five-player fantasy basketball lineup: the combination of players predicted to score the most fantasy points while staying under a salary cap.",
    points: [
      "This tutorial points out each section of the page in turn, with what it shows and what you can do there.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "page-header",
    title: "How the lineup is picked",
    summary:
      "A solver picks the five players with the highest total predicted fantasy points that fit under the cap — the best combination, not just the five top scorers.",
    points: [
      // apps/optimizer/predict.py: DraftKings classic scoring over a
      // recency-weighted average of each player's regular-season games.
      "Fantasy points score a player's stats DraftKings-style. Each prediction weights a player's recent games more than older ones.",
      "The solver uses MILP (mixed-integer linear programming), a maths method that finds the best choice that obeys every rule.",
      // predict.py derives salary from predicted points — there is no real
      // DFS pricing behind it, and the header says so too.
      "Salaries aren't real. They're worked out from the same predictions, so players predicted to score more cost more. Solved shows when this lineup was picked.",
    ],
  },
  {
    regionId: "lineup-totals",
    title: "Lineup totals",
    summary: "The lineup's projected points, the salary it uses and the budget cap it has to fit under.",
    points: [
      "The bar under Salary used shows how much of the cap is spent, and turns red if the lineup goes over it.",
      "The budget cap can only be changed while you're editing the lineup.",
    ],
  },
  {
    regionId: "edit-lineup",
    title: "Edit the lineup",
    summary: "Try your own version of the lineup. Edits only last while you're on this page, unless you save the lineup.",
    points: [
      "Click Edit lineup to remove players, add others or change the budget cap. Done editing closes the edit tools; Reset puts the solver's lineup back.",
      // Both panels render only while the board has fewer than five players.
      "Once a spot is free, Suggested adds lists the best-value players that still fit under the cap — any who fill a missing guard or forward spot first — and you can search for any player by name.",
    ],
  },
  {
    regionId: "lineup-table",
    title: "The lineup",
    summary: "The players in the lineup, with each one's team, position, projected points and salary.",
    points: [
      "$ / PT is salary divided by projected points. Lower means better value for the money.",
      "Click a player's name to open their page.",
    ],
  },
  {
    regionId: "solver-checks",
    title: "Solver checks and saving",
    summary: "The rules the solver follows, checked against the lineup on the board right now, edits included.",
    points: [
      "Every lineup needs exactly five different players, at least one guard and at least one forward, and has to fit under the cap.",
      "Save lineup only works once every check is met. The note beside it says what is still missing.",
      "Save lineup asks you to name the lineup, then saves it to your account. You'll find it on your profile and on your home page's saved shelf.",
    ],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole page. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const OPTIMIZER_TUTORIAL: PageTutorialDefinition = {
  id: OPTIMIZER_TUTORIAL_ID,
  pageName: "optimizer",
  regions: OPTIMIZER_TUTORIAL_REGIONS,
  steps: OPTIMIZER_TUTORIAL_STEPS,
};
