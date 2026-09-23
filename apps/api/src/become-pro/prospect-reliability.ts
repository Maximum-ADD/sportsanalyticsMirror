// How much of a self-reported season is actually backed by a document an
// admin has checked.
//
// Named "reliability" in the product and kept well away from the frontend's
// lib/reliability.ts, which measures something unrelated (how close a
// player's recent games landed to today's predicted points). Nothing here
// touches Nest, Prisma or HTTP.
//
// This is a measure of DOCUMENTATION, not of truth: a well-verified season is
// one somebody produced paperwork for, which is the strongest claim this
// system can make about numbers a person typed in about themselves.

export type ProspectReliabilityTier = "UNDOCUMENTED" | "PARTIAL" | "STRONG";

export interface ProspectReliability {
  gamesLogged: number;
  gamesVerified: number;
  gamesDocumented: number;
  /** 0-1, share of logged games covered by VERIFIED evidence. */
  verifiedCoverage: number;
  /** 0-1, share covered by evidence of any status. */
  documentedCoverage: number;
  tier: ProspectReliabilityTier;
  // Null ONLY when no games are logged. A score of 0 with games on record is
  // a real measurement — nothing has been documented yet — and must render
  // as 0 rather than as an absence.
  score: number | null;
}

// Verified coverage at or above this is STRONG; anything above zero is
// PARTIAL. Deliberately not a smooth gradient: the tier changes how much
// weight the value figure is presented with, and three named steps are a
// claim this evidence can support where a continuous confidence percentage
// would not be.
export const STRONG_COVERAGE_THRESHOLD = 0.7;

// Verified documents are what the score is really about, but a season with
// uploads still awaiting review is in a better state than one with none at
// all, so pending coverage earns a fraction of the credit. Kept low enough
// that uploading a pile of unreviewed files cannot reach STRONG on its own.
const DOCUMENTED_WEIGHT = 0.3;
const VERIFIED_WEIGHT = 0.7;
const SCORE_SCALE = 100;

/** One game's evidence standing, as the caller reads it off the row. */
export interface ProspectGameEvidenceState {
  /** True when this game points at a document at all. */
  hasEvidence: boolean;
  /** True when that document has been approved by an admin. */
  isVerified: boolean;
}

/**
 * Scores how well documented a season is.
 *
 * @param games - every logged game with its evidence standing, in any order.
 * @returns the coverage figures, the tier and a 0-100 score, or a null score
 *          when there are no games at all.
 *
 * A game whose document was REJECTED counts as neither documented nor
 * verified: a rejected scoresheet is evidence that was looked at and found
 * wanting, which is weaker than no claim at all, so it earns nothing rather
 * than partial credit.
 */
export function calculateProspectReliability(games: ProspectGameEvidenceState[]): ProspectReliability {
  const gamesLogged = games.length;
  if (gamesLogged === 0) {
    return {
      gamesLogged: 0,
      gamesVerified: 0,
      gamesDocumented: 0,
      verifiedCoverage: 0,
      documentedCoverage: 0,
      tier: "UNDOCUMENTED",
      score: null,
    };
  }

  const gamesVerified = games.filter((game) => game.isVerified).length;
  const gamesDocumented = games.filter((game) => game.hasEvidence).length;
  const verifiedCoverage = gamesVerified / gamesLogged;
  const documentedCoverage = gamesDocumented / gamesLogged;

  const score = Math.round(
    (VERIFIED_WEIGHT * verifiedCoverage + DOCUMENTED_WEIGHT * documentedCoverage) * SCORE_SCALE
  );

  return {
    gamesLogged,
    gamesVerified,
    gamesDocumented,
    verifiedCoverage: roundToFourDecimals(verifiedCoverage),
    documentedCoverage: roundToFourDecimals(documentedCoverage),
    tier: tierFor(verifiedCoverage),
    score,
  };
}

function tierFor(verifiedCoverage: number): ProspectReliabilityTier {
  if (verifiedCoverage >= STRONG_COVERAGE_THRESHOLD) return "STRONG";
  if (verifiedCoverage > 0) return "PARTIAL";
  return "UNDOCUMENTED";
}

// Four places, matching calculateHitRate in leaderboard-ranking.ts: without
// rounding, four of fourteen serialises as 0.2857142857142857, which no
// caller wants and no display uses.
function roundToFourDecimals(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
