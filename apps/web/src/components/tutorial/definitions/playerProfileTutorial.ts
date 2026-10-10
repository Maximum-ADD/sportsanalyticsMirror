import type { PageTutorialDefinition, TutorialMapRegion, TutorialStep } from "@/lib/pageTutorial";

// The player profile tutorial: what the page is for, then one step per panel
// in the order a reader meets them — the season line and points trend down
// the wide column, the traits radar beside them, then the full-width panels
// underneath — and last, where to find the tutorial again.
//
// The map mirrors PlayerProfilePage's own layout at desktop width: a
// 3-column grid, the first panel spanning two columns (player header,
// segment control, stat tiles and the points trend chart) with Player traits
// in the third, then shooting splits, regular season vs postseason, matchup
// analysis, bio and career each full width below. The header and stat tiles
// share one region because they are one panel on the page; bio and career
// share one because they are the two short reference panels at the foot.
// Moving a panel on the page means moving its region here too.
//
// Everything a step says has to be true of the page as built — no promised
// feature, and no figure that the server decides: those change without this
// file knowing.

/** UserSeenTutorial.tutorialId for this tutorial; give a reworked version a new id to show it again. */
export const PLAYER_PROFILE_TUTORIAL_ID = "player-profile";

// Map units — see lib/pageTutorial.ts. The page frame's content area runs
// x 36-184; the wide column takes 36-132 and the narrow one 136-184 down to
// the end of the radar, and the panels below it span the full width.
const PLAYER_PROFILE_TUTORIAL_REGIONS: TutorialMapRegion[] = [
  {
    id: "season-line",
    label: "Season line",
    x: 36,
    y: 18,
    width: 96,
    height: 28,
    sketch: "page-header",
    calloutSide: "left",
  },
  {
    id: "points-trend",
    label: "Points trend",
    x: 36,
    y: 49,
    width: 96,
    height: 20,
    sketch: "chart",
    calloutSide: "left",
  },
  {
    id: "player-traits",
    label: "Player traits",
    x: 136,
    y: 18,
    width: 48,
    height: 51,
    sketch: "bars",
    calloutSide: "right",
  },
  {
    id: "shooting-splits",
    label: "Shooting splits",
    x: 36,
    y: 72,
    width: 148,
    height: 10,
    sketch: "stat-blocks",
    calloutSide: "right",
  },
  {
    id: "season-splits",
    label: "Regular vs postseason",
    x: 36,
    y: 85,
    width: 148,
    height: 11,
    sketch: "rows",
    calloutSide: "left",
  },
  {
    id: "matchup-analysis",
    label: "Matchup analysis",
    x: 36,
    y: 98,
    width: 148,
    height: 11,
    sketch: "rows",
    calloutSide: "right",
  },
  {
    id: "bio-career",
    label: "Bio and career",
    x: 36,
    y: 111,
    width: 148,
    height: 9,
    sketch: "stat-blocks",
    calloutSide: "left",
  },
  // Last, so it is drawn over the career panel's corner the way the real
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

const PLAYER_PROFILE_TUTORIAL_STEPS: TutorialStep[] = [
  {
    regionId: null,
    title: "One player, in full",
    summary:
      "This is a player's own page: their averages, how their scoring has moved, their strengths, how they do against each team, and their career so far.",
    points: [
      "This tutorial points out each section of the page in turn, with what it shows and what you can do there.",
      "Move through it with Next and Previous. Skip closes it; Skip all also stops tutorials opening by themselves on other pages.",
    ],
  },
  {
    regionId: "season-line",
    title: "Season line",
    summary:
      "The player's per-game averages for one segment: Regular, Play-In, Playoffs or Finals. The segments are kept apart, so playoff games never mix into regular-season figures.",
    points: [
      // Not "this season": the profile's averages come from every game held
      // for the player in the segment (PlayersService.getPlayerSeasonStats
      // filters on seasonType only), earlier seasons included.
      "The tiles average every game we hold for the player in that segment, across all the seasons we hold. The trend, traits and shooting splits follow the same choice.",
      "Each tile names its stat in full under the number. USG% is the share of the team's possessions that end with the player shooting, drawing a foul or turning it over. +/- is the average score margin while they're on court. ORTG and DRTG are points scored and allowed per 100 possessions. The i button at the end of the segment row explains these four again.",
      "Edit stats lets you type in your own numbers to see the tiles, traits and shooting change. Nothing is saved, and Reset puts the real figures back.",
      "Compare opens this player on the Compare page. When you're signed in, Follow adds them to the watchlist on your home page.",
      // PlayerInjuryBadge renders nothing for a player not on the report.
      "If the player is on ESPN's injury report, a badge under their name shows whether they're out or day-to-day, the injury, and when ESPN expects them back. That date is ESPN's estimate.",
    ],
  },
  {
    regionId: "points-trend",
    title: "Points trend",
    summary: "Points scored game by game, one season at a time.",
    points: [
      "The season buttons pick which season's games the chart plots. It starts on the most recent.",
      "In the regular season, the projected button charts the games still on the team's schedule, each adjusted for the opponent. With no schedule to use, it carries the player's scoring average across a full season instead.",
    ],
  },
  {
    regionId: "player-traits",
    title: "Player traits",
    summary:
      "A five-sided chart of scoring, rebounding, playmaking, defense and efficiency, each put on a 0 to 100 scale so they can share one chart.",
    points: [
      "Each trait is measured against a fixed top mark, not against other players — 100 means at or above that mark.",
      "Click a trait's name to see the real figures behind its shape.",
    ],
  },
  {
    regionId: "shooting-splits",
    title: "Shooting splits",
    summary: "How often the player's shots go in, for the segment you picked.",
    points: [
      "FG%, 3P% and FT% are the share of field goals, threes and free throws made. FTA/G is free throws attempted per game.",
      "TS% (true shooting) is scoring efficiency that counts threes and free throws. eFG% weighs a three as worth more than a two. The i button on the section heading explains both.",
    ],
  },
  {
    regionId: "season-splits",
    title: "Regular season vs postseason",
    summary:
      "How the player's figures changed once the postseason started, side by side. This panel doesn't follow the segment you picked above.",
    points: [
      "There's a column for each segment the player appeared in, with the number of games under its name.",
      "Each postseason figure shows its change from the regular season. For defensive rating, a fall is the improvement.",
      "Postseason samples are small, so rates from very few games are dimmed.",
    ],
  },
  {
    regionId: "matchup-analysis",
    title: "Matchup analysis",
    summary:
      "How the player has scored against each team in the regular season, and what that suggests for the games to come.",
    points: [
      "When the team has a game coming up, the top card projects their points in it. It blends their overall scoring rate with their rate against that opponent, trusting the opponent's figure more the more games it's based on.",
      "Below it, a bar for every opponent they've faced shows their points per game against that team, highest first.",
    ],
  },
  {
    regionId: "bio-career",
    title: "Bio and career",
    summary: "Who the player is, and their record across everything we hold for them.",
    points: [
      "Bio has their height, weight, age, school or country, years in the league and draft details.",
      // StatsService.getCareerStats reads every row with no seasonType
      // filter, so the career figures — and each season's row — mix
      // regular-season and postseason games.
      "Career averages every game we hold, playoffs included, with a row for each season.",
    ],
  },
  {
    regionId: "help-button",
    title: "Replay any time",
    summary: "That's the whole page. This tutorial won't open by itself again.",
    points: ["Click the ? button at the bottom right of your screen whenever you want to see it again."],
  },
];

export const PLAYER_PROFILE_TUTORIAL: PageTutorialDefinition = {
  id: PLAYER_PROFILE_TUTORIAL_ID,
  pageName: "player profile",
  regions: PLAYER_PROFILE_TUTORIAL_REGIONS,
  steps: PLAYER_PROFILE_TUTORIAL_STEPS,
};
