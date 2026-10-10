import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The Become Pro page tutorial: what the page is for, then one step per
// section in the order a reader meets them — the header, down the wide
// column, down the narrow one — and last, where to find the tutorial again.
//
// The map mirrors BecomeProPage's layout at desktop width once a season is
// under way: the header full width, then a 12-column grid split 8/4 — the
// wide column holding your games, season line, scoring chart and NBA rookie
// comparison, the narrow one the projected value card, traits radar and the
// "How the valuation works" note. A user with no season yet sees only the
// header, the how-it-works steps, the setup form and that note, so the
// welcome step says so instead of drawing a second map. Moving a section on
// the page means moving its region here too.
//
// Everything a step says has to be true of the page as built — no promised
// feature, and no figure that the server decides (the minimum games before a
// season is valued, the level factors): those change without this file
// knowing. Become Pro compares the user only with NBA rookies, never with
// other users; every step must keep that true.

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const BECOME_PRO_TUTORIAL_ID = "become-pro";

// Map units — see lib/pageTutorial.ts. The page frame's content area runs
// x 36-184; the wide column takes 36-132 and the narrow one 136-184.
const BECOME_PRO_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "season-header",
    label: "Your season",
    x: 36,
    y: 18,
    width: 148,
    height: 20,
    sketch: "page-header",
    calloutSide: "left",
  },
  {
    id: "your-games",
    label: "Your games",
    x: 36,
    y: 42,
    width: 96,
    height: 30,
    sketch: "table",
    calloutSide: "left",
  },
  {
    id: "season-line",
    label: "Season line",
    x: 36,
    y: 76,
    width: 96,
    height: 11,
    sketch: "stat-blocks",
    calloutSide: "left",
  },
  {
    id: "scoring-by-game",
    label: "Scoring by game",
    x: 36,
    y: 91,
    width: 96,
    height: 13,
    sketch: "chart",
    calloutSide: "left",
  },
  {
    id: "nba-rookies",
    label: "Against NBA rookies",
    x: 36,
    y: 108,
    width: 96,
    height: 12,
    sketch: "rows",
    calloutSide: "left",
  },
  {
    id: "projected-value",
    label: "Projected value",
    x: 136,
    y: 42,
    width: 48,
    height: 26,
    sketch: "value",
    calloutSide: "right",
  },
  {
    id: "traits",
    label: "Traits",
    x: 136,
    y: 72,
    width: 48,
    height: 20,
    sketch: "bars",
    calloutSide: "right",
  },
  {
    id: "how-it-works",
    label: "How it works",
    x: 136,
    y: 96,
    width: 48,
    height: 12,
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

const BECOME_PRO_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "Welcome to Become Pro",
    summary:
      "Log the games of a season you play yourself, and see what it projects to on the NBA rookie salary scale — and which real NBA rookies your game looks most like.",
    points: [
      "Only you can see this page. You're compared with NBA rookies only, never with other users.",
      "New here? The page explains how it works, then asks for a short form: the season, your position, the level you played at and, if you like, your team — then Start season. This tutorial shows the page once a season is under way.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "season-header",
    title: "Your season",
    summary: "The top of the page names the season you're looking at: its year, competition level, position and team.",
    points: [
      "Edit details changes those. Add a season starts another year; once you have more than one, switch between them with the year buttons here.",
      "Delete season asks you to click again to confirm, because it removes the season and every game in it.",
    ],
  },
  {
    regionId: "your-games",
    title: "Your games",
    summary: "Where you log your season, one game at a time.",
    points: [
      "Enter a game's date, opponent and box score, then Add game. Copy last game fills the form in from your latest game, to save typing.",
      "Your games are listed newest first. Edit corrects one; Remove deletes it once you confirm.",
      "Everything else on the page is worked out from these games — your season line is never typed in.",
    ],
  },
  {
    regionId: "season-line",
    title: "Season line",
    summary: "Your per-game averages across the games you've logged. It appears once you've logged one.",
    points: [
      "PPG, RPG and APG are points, rebounds and assists per game; SPG, BPG, MPG and TOV are steals, blocks, minutes and turnovers.",
      "FG%, 3P% and FT% are your shooting from the field, from three and from the line. TS% (true shooting) is one efficiency figure that counts threes and free throws. A dash means no attempts.",
      "With only a few games logged, a note warns that these figures will still move a lot.",
    ],
  },
  {
    regionId: "scoring-by-game",
    title: "Scoring by game",
    summary: "Your points in each game, earliest on the left. It appears once you've logged more than one game.",
    points: ["Use it to see whether your scoring is rising, falling or holding steady through the season."],
  },
  {
    regionId: "nba-rookies",
    title: "Against NBA rookies",
    summary:
      "The real NBA rookies whose first season looks most like yours. It appears alongside your projected value.",
    points: [
      "The radar lays your line over theirs, and each name shows how similar you are. Similarity is a shape match: it means the profiles look alike, not that the players are equal.",
      "If you played somewhere other than NCAA Division I, your line is translated to Division I level first, and the radar shows that translated line.",
      "Click a name to open that player's page. Under the list are NBA players drafted at the pick your season projects to.",
    ],
  },
  {
    regionId: "projected-value",
    title: "Projected value",
    summary: "What your season projects to be worth on the NBA rookie salary scale.",
    points: [
      "Until there's a figure to show, the card says why — usually how many more games you need to log.",
      "Then it shows a projected draft pick, and the rookie scale's salary for that pick with a range around it. The pick is what the model predicts; the money follows from it.",
      "Before it's valued, your line is translated to Division I level for the competition you played against. It's a projection, not an offer or a market price.",
    ],
  },
  {
    regionId: "traits",
    title: "Traits",
    summary: "The shape of your game across five traits: scoring, rebounding, playmaking, defense and efficiency.",
    points: [
      "Each trait is scored out of 100 from your season line, as you logged it.",
      "Click a trait's name to see the figures behind it.",
    ],
  },
  {
    regionId: "how-it-works",
    title: "How the valuation works",
    summary: "A plain-English note on how the projection is made. Click it to open it.",
    points: ["It covers what the model learns from — real NBA rookies and where they were drafted — and what the figure is and isn't."],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole page. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const BECOME_PRO_TUTORIAL: PageTutorialDefinition = {
  id: BECOME_PRO_TUTORIAL_ID,
  pageName: "Become Pro",
  regions: BECOME_PRO_TUTORIAL_REGIONS,
  steps: BECOME_PRO_TUTORIAL_STEPS,
};
