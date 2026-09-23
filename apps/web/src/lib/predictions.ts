// Shared prediction-grading helpers — originally lived only in
// PredictionsPage.tsx, pulled out here once a second surface (HomePage's
// Recent Results + model highlights) needed the same "was the model right"
// logic without duplicating it.
import type { Game, GamePrediction } from "@/types/nba";

export const PERCENT = (value: number) => `${Math.round(value * 100)}%`;

export function formatMargin(
  predictedMarginHome: number | null,
  homeTeam: Game["homeTeam"],
  awayTeam: Game["awayTeam"]
): string {
  if (predictedMarginHome === null) return "—";
  const favored = predictedMarginHome >= 0 ? homeTeam : awayTeam;
  return `${favored.abbreviation} by ${Math.abs(predictedMarginHome).toFixed(1)}`;
}

// A prediction can only be graded once the game has a real final score —
// an upcoming game has a live forecast but nothing to check it against yet.
export function isCompleted(game: Game): boolean {
  return game.homeScore !== null && game.awayScore !== null;
}

export function wasModelHit(game: Game, prediction: GamePrediction): boolean | null {
  if (!isCompleted(game)) return null;
  const homeWon = game.homeScore! > game.awayScore!;
  const modelFavoredHome = prediction.homeWinProbability >= 0.5;
  return homeWon === modelFavoredHome;
}
