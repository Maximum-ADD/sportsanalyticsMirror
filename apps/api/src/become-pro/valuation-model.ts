import type { DerivedSeasonAverages } from "../players/season-averages.js";
import { adjustForLevel } from "./level-adjustment.js";

// Applies a trained Become Pro draft-slot model to one prospect's season.
//
// TRAINING happens in Python (apps/valuation/train_valuation_model.py), which
// fits the model on real NBA rookie production and stores it — coefficients
// plus every table needed to use them — as a ProspectValuationModel bundle.
// APPLYING it happens here, because it has to run the moment a prospect adds,
// edits or deletes a game, and the API is the only thing guaranteed to be
// running when they do.
//
// Nothing here touches Nest, Prisma or HTTP: every function takes plain values
// and returns plain values, so the whole projection can be tested from
// literals. No language model is involved — a trained linear model applied is
// a dot product.

/** The shape train_valuation_model.py's build_bundle writes. */
export interface ValuationModelBundle {
  modelVersion: string;
  featureNames: string[];
  /** Intercept first, then one weight per feature, in featureNames order. */
  coefficients: number[];
  minimumGamesRequired: number;
  slotBounds: { min: number; max: number };
  rookieScale: {
    year: string;
    firstRoundPicks: number;
    draftPicks: number;
    /** Pick number (as a string key) -> first-year scale salary. */
    firstRound: Record<string, number>;
    secondRoundValue: number;
    undraftedValue: number;
  };
  levelFactors: Record<string, { factor: number; basis: string }>;
  unknownLevelFactor: { factor: number; basis: string };
  interval: {
    baseFraction: number;
    shortLogGames: number;
    shortLogExtraFraction: number;
  };
  /** The rookie seasons the model was fitted on — the pool comparables come from. */
  comparableIndex: { playerId: string; draftNumber: number; features: number[] }[];
}

export interface ValuationInput {
  averages: DerivedSeasonAverages;
  competitionLevel: string;
  gamesLogged: number;
}

export interface ValuationDriver {
  label: string;
  detail: string;
}

export interface ValuationResult {
  projectedDraftSlot: number;
  projectedValueUsd: number;
  projectedValueLowUsd: number;
  projectedValueHighUsd: number;
  rookieScaleYear: string;
  levelFactor: number;
  levelFactorBasis: string;
  drivers: ValuationDriver[];
  comparablePlayerIds: string[];
  comparableScores: number[];
}

// How many NBA rookies to offer as comparables per prospect.
export const COMPARABLE_COUNT = 3;

// Playmaking only earns a line in the explanation when there is something to
// say about it — "1.1 assists per game" is noise, not a driver.
const PLAYMAKING_DRIVER_THRESHOLD = 4;

/** The multiplier and its stated basis for one competition level. */
export function levelFactorFor(
  bundle: ValuationModelBundle,
  competitionLevel: string
): { factor: number; basis: string } {
  // An unrecognised level gets the most conservative factor rather than
  // failing: under-claiming is the right failure direction for a figure
  // presented as somebody's professional value, and the basis says so.
  return bundle.levelFactors[competitionLevel] ?? bundle.unknownLevelFactor;
}

/**
 * The model's four inputs, in the order the coefficients expect.
 *
 * Read by NAME from the bundle's featureNames rather than assumed, so a
 * re-trained model with its features reordered cannot be silently applied
 * with every weight on the wrong input.
 */
export function featureRow(bundle: ValuationModelBundle, averages: DerivedSeasonAverages): number[] {
  const byName: Record<string, number> = {
    points_per_game: averages.pointsPerGame,
    rebounds_per_game: averages.reboundsPerGame,
    assists_per_game: averages.assistsPerGame,
    true_shooting: averages.trueShootingPercentage,
  };
  return bundle.featureNames.map((name) => {
    const value = byName[name];
    if (value === undefined) {
      throw new Error(`Valuation model expects feature "${name}", which this API does not know how to supply`);
    }
    return value;
  });
}

/**
 * The draft slot a (level-adjusted) line projects to.
 *
 * Clamped into the bundle's slot bounds: the fit is linear, and a spectacular
 * line would otherwise extrapolate to pick zero or a negative one, which is
 * not a pick.
 */
export function projectSlot(bundle: ValuationModelBundle, features: number[]): number {
  const [intercept, ...weights] = bundle.coefficients;
  const raw = weights.reduce((sum, weight, index) => sum + weight * features[index], intercept);
  return Math.min(bundle.slotBounds.max, Math.max(bundle.slotBounds.min, Math.round(raw)));
}

/** First-year dollars for a draft slot, from the published scale the bundle carries. */
export function valueForSlot(bundle: ValuationModelBundle, slot: number): number {
  const scale = bundle.rookieScale;
  if (slot <= scale.firstRoundPicks) {
    const value = scale.firstRound[String(slot)];
    if (value === undefined) throw new Error(`Rookie scale has no figure for pick ${slot}`);
    return value;
  }
  if (slot <= scale.draftPicks) return scale.secondRoundValue;
  return scale.undraftedValue;
}

/**
 * A low/high band around a point estimate.
 *
 * Always shown beside the figure, because the honest reading of this model is
 * "somewhere in this neighbourhood". Widened for a short game log, where the
 * season line itself is still settling and so genuinely supports less.
 *
 * Kept inside what the rookie scale can actually pay: no pick earns more than
 * the top of the scale or less than its floor, so a band reaching past either
 * would be quoting money no draft slot carries (a pick-1 projection read
 * "$7.3M – $18.3M" before this bound).
 */
export function valueInterval(
  bundle: ValuationModelBundle,
  valueUsd: number,
  gamesLogged: number
): { low: number; high: number } {
  let fraction = bundle.interval.baseFraction;
  if (gamesLogged < bundle.interval.shortLogGames) fraction += bundle.interval.shortLogExtraFraction;

  const ceiling = valueForSlot(bundle, bundle.slotBounds.min);
  const floor = valueForSlot(bundle, bundle.slotBounds.max);

  return {
    low: Math.max(floor, Math.round(valueUsd * (1 - fraction))),
    high: Math.min(ceiling, Math.round(valueUsd * (1 + fraction))),
  };
}

/**
 * The NBA rookie seasons whose shape is closest to this line.
 *
 * Distance is Euclidean over the STANDARDISED feature vector, so a stat with a
 * wide spread (points) cannot swamp one with a narrow spread (assists) purely
 * because of its units. Similarity is in [0, 1], highest first — a shape
 * match, never a claim that the players are equivalent, which is exactly what
 * the profile page's caption says.
 */
export function findComparables(
  bundle: ValuationModelBundle,
  features: number[],
  count: number = COMPARABLE_COUNT
): { playerId: string; similarity: number }[] {
  const index = bundle.comparableIndex;
  if (index.length === 0) return [];

  const dimensions = features.length;
  const means = Array.from({ length: dimensions }, (_, d) => mean(index.map((row) => row.features[d])));
  const spreads = Array.from({ length: dimensions }, (_, d) => {
    const spread = standardDeviation(index.map((row) => row.features[d]), means[d]);
    // A constant feature carries no information; treat its spread as 1
    // rather than dividing by zero and handing it infinite weight.
    return spread === 0 ? 1 : spread;
  });

  const standardise = (vector: number[]) => vector.map((value, d) => (value - means[d]) / spreads[d]);
  const target = standardise(features);
  const distances = index.map((row) => euclidean(standardise(row.features), target));
  const worst = Math.max(...distances) || 1;

  return index
    .map((row, position) => ({ playerId: row.playerId, distance: distances[position] }))
    .sort((a, b) => a.distance - b.distance || a.playerId.localeCompare(b.playerId))
    .slice(0, count)
    .map(({ playerId, distance }) => ({
      playerId,
      similarity: Math.round((1 - distance / worst) * 10_000) / 10_000,
    }));
}

/**
 * Two or three sentences naming what in the season line moved this figure.
 *
 * Authored here, server-side, on purpose: a client-written explanation of a
 * server-side model would be invention. The client renders these verbatim.
 *
 * The competition level is deliberately not one of them: the valuation
 * already carries levelFactor and levelFactorBasis, which the page prints as
 * the figure's provenance, and repeating the same sentence as a driver
 * printed it twice on one card.
 */
export function describeDrivers(averages: DerivedSeasonAverages, levelFactor: number): ValuationDriver[] {
  const drivers: ValuationDriver[] = [
    {
      label: "Scoring",
      detail: `${averages.pointsPerGame.toFixed(1)} points per game, counted as ${(
        averages.pointsPerGame * levelFactor
      ).toFixed(1)} after the level adjustment.`,
    },
    {
      label: "Efficiency",
      detail: `${averages.trueShootingPercentage.toFixed(1)}% true shooting on that scoring volume.`,
    },
  ];

  if (averages.assistsPerGame >= PLAYMAKING_DRIVER_THRESHOLD) {
    drivers.push({
      label: "Playmaking",
      detail: `${averages.assistsPerGame.toFixed(1)} assists per game is a real part of this profile.`,
    });
  }
  return drivers;
}

/**
 * Values one prospect season with a trained model.
 *
 * @returns the full valuation, or null when the season is below the games
 *          floor — where no figure is the honest answer, and a zero would be a
 *          valuation the model never made.
 */
export function applyValuationModel(bundle: ValuationModelBundle, input: ValuationInput): ValuationResult | null {
  if (input.gamesLogged < bundle.minimumGamesRequired) return null;

  const { factor, basis } = levelFactorFor(bundle, input.competitionLevel);
  // Volume discounted, rates untouched — the same translation the comparison
  // radar plots (level-adjustment.ts), so the figure and the picture beside it
  // come from one line.
  const adjusted = adjustForLevel(input.averages, factor);
  const features = featureRow(bundle, adjusted);

  const slot = projectSlot(bundle, features);
  const value = valueForSlot(bundle, slot);
  const { low, high } = valueInterval(bundle, value, input.gamesLogged);
  const comparables = findComparables(bundle, features);

  return {
    projectedDraftSlot: slot,
    projectedValueUsd: value,
    projectedValueLowUsd: low,
    projectedValueHighUsd: high,
    rookieScaleYear: bundle.rookieScale.year,
    levelFactor: factor,
    levelFactorBasis: basis,
    drivers: describeDrivers(input.averages, factor),
    comparablePlayerIds: comparables.map((comparable) => comparable.playerId),
    comparableScores: comparables.map((comparable) => comparable.similarity),
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Population standard deviation, matching numpy's default (ddof=0) in the
// Python that trained the model on the same rows.
function standardDeviation(values: number[], valuesMean: number): number {
  return Math.sqrt(values.reduce((sum, value) => sum + (value - valuesMean) ** 2, 0) / values.length);
}

function euclidean(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0));
}
