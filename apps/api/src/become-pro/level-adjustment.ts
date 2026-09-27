import { round, type DerivedSeasonAverages } from "../players/season-averages.js";

// A prospect's season line translated to the level the valuation model
// compares against, so the comparison radar plots the SAME line the
// similarity score was computed on.
//
// Without this the radar overlays a prospect's raw line on NBA rookies: a
// Division II player's 24 points a game would tower over a rookie Jayson
// Tatum's 14 even though the model — which discounted those 24 to roughly 15 —
// rated the two only loosely alike. The picture would contradict the number
// printed beside it.
//
// Computed here rather than in the browser on purpose: the level factor is
// the model's assumption, and the client never applies it itself (the same
// rule that keeps the dollar figure server-authored). The factors themselves
// come from apps/valuation/level_factors.py via the model bundle. VOLUME is
// discounted, RATES are not — shooting 58% against weaker opposition still
// means the shots went in.

// Every per-game counting figure: how much a player produced, which is what
// varies with who they were producing against. Minutes are deliberately
// absent — playing time is not production, and discounting it would imply a
// prospect played less than they did.
const VOLUME_FIELDS = [
  "pointsPerGame",
  "reboundsPerGame",
  "assistsPerGame",
  "stealsPerGame",
  "blocksPerGame",
  "turnoversPerGame",
  "fieldGoalsMadePerGame",
  "fieldGoalsAttemptedPerGame",
  "threesMadePerGame",
  "threesAttemptedPerGame",
  "freeThrowsMadePerGame",
  "freeThrowsAttemptedPerGame",
] as const satisfies readonly (keyof DerivedSeasonAverages)[];

/**
 * A season line with its production discounted by a competition-level factor.
 *
 * @param averages - the line as logged.
 * @param levelFactor - the valuation's stored multiplier (1.0 for NCAA D1).
 * @returns a copy with every volume figure scaled and rounded to one decimal,
 *          and every percentage, ratio and null carried through untouched.
 *          Making and attempting scale together, so the shooting percentages
 *          this leaves alone stay consistent with the figures beside them.
 */
export function adjustForLevel(averages: DerivedSeasonAverages, levelFactor: number): DerivedSeasonAverages {
  const adjusted: DerivedSeasonAverages = { ...averages };
  for (const field of VOLUME_FIELDS) {
    adjusted[field] = round(averages[field] * levelFactor);
  }
  return adjusted;
}
