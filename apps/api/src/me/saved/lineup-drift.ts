// Drift arithmetic for saved lineups. Deliberately pure and database-free:
// it is the only place that decides what "the lineup moved" means, so it is
// the piece worth unit-testing without a Postgres round trip.
//
// Why the "at save" numbers are stored rather than re-derived: PlayerPrediction
// is append-and-take-latest-by-asOf — the optimizer writes a fresh row per
// player per run and every reader takes the newest one. If a saved lineup
// re-derived its own points/salary on read, both sides of the subtraction
// would come from the same latest row and the drift would be permanently
// zero, while the totals the user believed they saved silently changed
// underneath them. The frozen columns are what makes drift observable at all.

// Points are floats coming out of the model, so subtracting them produces
// values like 0.30000000000000426. Two decimals is the precision the UI
// shows and is well inside the model's own significance.
const POINTS_DELTA_DECIMAL_PLACES = 2;
const POINTS_ROUNDING_FACTOR = 10 ** POINTS_DELTA_DECIMAL_PLACES;

/**
 * One saved slot paired with the player's current prediction.
 *
 * `latestPredictedFantasyPoints` / `latestSalary` are null when the player has
 * no PlayerPrediction row at all any more (or never had one). Null means
 * "unknown", not "zero" — see deriveSlotDrift for how that is treated.
 */
export interface SavedSlotValuation {
  playerId: string;
  predictedPointsAtSave: number;
  salaryAtSave: number;
  latestPredictedFantasyPoints: number | null;
  latestSalary: number | null;
}

/** How far one player has moved since the lineup was saved. */
export interface SlotDrift {
  playerId: string;
  pointsDelta: number;
  salaryDelta: number;
}

/** How far a whole saved lineup has moved since it was saved. */
export interface LineupDrift {
  pointsDelta: number;
  salaryDelta: number;
  isOverBudget: boolean;
}

// Trims float noise off a points subtraction. Salaries are integers and are
// left exactly as they are.
function roundPointsDelta(pointsDelta: number): number {
  return Math.round(pointsDelta * POINTS_ROUNDING_FACTOR) / POINTS_ROUNDING_FACTOR;
}

// A missing current prediction falls back to the frozen value, which yields a
// zero delta for that slot. The alternative — treating the absence as 0 points
// / $0 salary — would report a large fake drop for a player the pipeline
// simply has not re-predicted, and this API must not invent movement that the
// data does not show.
function valueOrSaved(latestValue: number | null, savedValue: number): number {
  return latestValue ?? savedValue;
}

/**
 * Drift for a single saved slot, as latest-minus-saved.
 *
 * @param valuation - the slot's frozen values plus the player's current prediction.
 * @returns the player's points and salary movement; both zero when there is no
 *          current prediction to compare against.
 */
export function deriveSlotDrift(valuation: SavedSlotValuation): SlotDrift {
  const latestPoints = valueOrSaved(valuation.latestPredictedFantasyPoints, valuation.predictedPointsAtSave);
  const latestSalary = valueOrSaved(valuation.latestSalary, valuation.salaryAtSave);
  return {
    playerId: valuation.playerId,
    pointsDelta: roundPointsDelta(latestPoints - valuation.predictedPointsAtSave),
    salaryDelta: latestSalary - valuation.salaryAtSave,
  };
}

// Sum of what the lineup's players are priced at right now, using each slot's
// frozen salary wherever no current prediction exists.
function sumLatestSalary(valuations: SavedSlotValuation[]): number {
  return valuations.reduce((total, valuation) => total + valueOrSaved(valuation.latestSalary, valuation.salaryAtSave), 0);
}

/**
 * Drift for a whole saved lineup: the sum of its slots' movement, plus whether
 * the lineup's players would still fit the budget it was saved under.
 *
 * Both sides of the subtraction are built from slot-level values rather than
 * from SavedLineup's stored totals, so a freshly saved lineup always reports
 * exactly zero drift — the totals columns record what the user was shown, and
 * are returned alongside this, but they are not what drift is measured from.
 *
 * @param valuations - one entry per saved slot; an empty lineup drifts by zero.
 * @param budgetAtSave - the salary cap in force when the lineup was saved.
 * @returns { pointsDelta, salaryDelta, isOverBudget }, latest minus saved.
 */
export function deriveLineupDrift(valuations: SavedSlotValuation[], budgetAtSave: number): LineupDrift {
  const slotDrifts = valuations.map(deriveSlotDrift);
  const pointsDelta = slotDrifts.reduce((total, slotDrift) => total + slotDrift.pointsDelta, 0);
  const salaryDelta = slotDrifts.reduce((total, slotDrift) => total + slotDrift.salaryDelta, 0);
  return {
    pointsDelta: roundPointsDelta(pointsDelta),
    salaryDelta,
    isOverBudget: sumLatestSalary(valuations) > budgetAtSave,
  };
}
