// Whether a season carries a projected value yet, and if not, why not.
//
// Nothing here touches Nest, Prisma or HTTP.

// How many logged games a season needs before it is valued at all.
//
// A season line over a handful of games is mostly noise — a shooting
// percentage from five games says little — and pricing it against the rookie
// scale would present that noise as a professional valuation. Ten is enough
// for the counting stats to settle. Shipped inside the trained model's bundle
// too (apps/valuation/train_valuation_model.py), and a test there pins the two
// to the same number.
export const MINIMUM_GAMES_REQUIRED = 10;

/**
 * VALUED           the season has a projected value.
 * BELOW_GAMES_FLOOR the prospect has not logged enough games yet — theirs to fix.
 * AWAITING_MODEL   enough games, but no valuation model has been trained yet —
 *                  the system's to fix, and said so rather than hidden.
 */
export type ValuationState = "VALUED" | "BELOW_GAMES_FLOOR" | "AWAITING_MODEL";

/**
 * Names the reason a season does or does not have a value.
 *
 * The two "no value" reasons are deliberately kept apart: somebody who has
 * logged thirty games must be able to tell "the model is not ready" from
 * "I have not logged enough", or a system gap reads as their own shortfall.
 */
export function describeValuationState(input: { gamesLogged: number; hasValue: boolean }): ValuationState {
  if (input.gamesLogged < MINIMUM_GAMES_REQUIRED) return "BELOW_GAMES_FLOOR";
  if (!input.hasValue) return "AWAITING_MODEL";
  return "VALUED";
}
