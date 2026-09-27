// The league year a player spends as a rookie, given the year they were
// drafted. The NBA draft is held in June, so a 2023 draftee's first season is
// 2023-24 — written in the "YYYY-YY" form Game.season uses.
//
// Mirrors rookie_season_label in apps/valuation/train_valuation_model.py. The two
// must agree: the valuation model trains on exactly this season, and the
// profile page plots and labels exactly this season, so any drift would show a
// comparable on a different line from the one the similarity describes.
export function rookieSeasonLabel(draftYear: number): string {
  return `${draftYear}-${String((draftYear + 1) % 100).padStart(2, "0")}`;
}
