// Shared "how much should I trust this predicted-points number" computation
// — originally lived only in GameDetailPage.tsx, pulled out here once a
// second surface (HomePage's trading cards) needed the same math without
// duplicating it. Not a claim the model predicted these past games the same
// way it's predicting today's — there's no stored history of past
// predictions to check against (see computeReliability below). This is a
// narrower, honestly-computable question instead: of a player's own last N
// games, how many landed close to what's being predicted for them today?

// How close a past game's actual points needs to land to today's predicted
// points to count as "close" — wide enough that ordinary game-to-game
// scoring variance doesn't make every player look unreliable, narrow enough
// that it still means something.
export const CLOSE_PREDICTION_TOLERANCE = 6;
export const RECENT_GAMES_FOR_RELIABILITY = 10;

// "Good" is deliberately not 50%, since a coin-flip on "within 6 points" is
// still a pretty rough guess for a fantasy decision; "bad" leaves clear room
// in between for a plain, uncolored "it's mixed" reading rather than forcing
// every number into green or red.
export const RELIABILITY_GOOD_THRESHOLD = 0.7;
export const RELIABILITY_BAD_THRESHOLD = 0.4;

export interface PredictionReliability {
  closeGames: number;
  totalGames: number;
  rate: number;
}

export function computeReliability(gameLog: { points: number }[], predictedPoints: number): PredictionReliability {
  const recent = gameLog.slice(0, RECENT_GAMES_FOR_RELIABILITY);
  const closeGames = recent.filter((entry) => Math.abs(entry.points - predictedPoints) <= CLOSE_PREDICTION_TOLERANCE).length;
  return { closeGames, totalGames: recent.length, rate: recent.length > 0 ? closeGames / recent.length : 0 };
}

export function reliabilityToneClass(rate: number): string {
  if (rate >= RELIABILITY_GOOD_THRESHOLD) return "text-locker-good";
  if (rate < RELIABILITY_BAD_THRESHOLD) return "text-locker-bad";
  return "text-landing-ink";
}
