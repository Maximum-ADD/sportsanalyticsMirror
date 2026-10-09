// Statistical outlier detection against a player's OWN history — the
// complement stat-anomalies.ts deliberately isn't: that file only catches
// values no legitimate box score could ever have (a made exceeding an
// attempt); this catches a value no legitimate box score FOR THIS PLAYER
// is likely to have, e.g. a bench player's one career 40-point game. A
// result here is a flag for a human to glance at, never evidence of a bug
// on its own — an outlier is sometimes just a great (or terrible) night.
//
// Pure and DB-free, like stat-anomalies.ts: the caller resolves the
// player's own prior games and passes their counting stats in; this never
// queries anything itself, so it's unit-testable on hand-built fixtures.
export type OutlierStatField =
  | "points"
  | "rebounds"
  | "assists"
  | "steals"
  | "blocks"
  | "turnovers";

export const OUTLIER_STAT_FIELDS: readonly OutlierStatField[] = [
  "points",
  "rebounds",
  "assists",
  "steals",
  "blocks",
  "turnovers",
];

export interface OutlierFinding {
  field: OutlierStatField;
  value: number;
  mean: number;
  standardDeviation: number;
  zScore: number;
}

// Below this many prior games, a mean/stddev is too noisy to flag against —
// an early-season or just-called-up player would otherwise get flagged for
// every game simply because their "history" is one or two data points. The
// README's own 15-games-per-team ingestion window puts most rostered
// players well above this once a season is a few weeks old.
const MINIMUM_PRIOR_GAMES = 5;

// |z| beyond this is treated as worth a human's attention. 3 is the
// conventional "more than three standard deviations" outlier bar — for a
// roughly normal in-season scoring distribution that is rare enough
// (<0.3% of games under a true normal) to be worth a glance without
// flagging half of every player's log.
const Z_SCORE_THRESHOLD = 3;

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Population, not sample, standard deviation: this describes the shape of
// the games actually observed, not an estimate generalised to a wider
// population the way a sample correction (n-1) would imply.
function standardDeviation(values: number[], populationMean: number): number {
  const variance = mean(values.map((value) => (value - populationMean) ** 2));
  return Math.sqrt(variance);
}

/**
 * Flags any field of `stat` whose value sits more than Z_SCORE_THRESHOLD
 * standard deviations from this player's own mean over `priorGames` — a
 * sparse or perfectly consistent history (stddev 0, which a zero-variance
 * run of identical lines produces) is left unflagged rather than dividing
 * by zero or firing on every game.
 */
export function findHistoricalOutliers(
  stat: Record<OutlierStatField, number>,
  priorGames: Record<OutlierStatField, number>[],
): OutlierFinding[] {
  if (priorGames.length < MINIMUM_PRIOR_GAMES) return [];

  const findings: OutlierFinding[] = [];
  for (const field of OUTLIER_STAT_FIELDS) {
    const priorValues = priorGames.map((game) => game[field]);
    const fieldMean = mean(priorValues);
    const fieldStandardDeviation = standardDeviation(priorValues, fieldMean);
    if (fieldStandardDeviation === 0) continue;

    const zScore = (stat[field] - fieldMean) / fieldStandardDeviation;
    if (Math.abs(zScore) > Z_SCORE_THRESHOLD) {
      findings.push({ field, value: stat[field], mean: fieldMean, standardDeviation: fieldStandardDeviation, zScore });
    }
  }

  return findings;
}
