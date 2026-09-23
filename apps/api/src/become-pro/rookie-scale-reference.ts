// The handful of rookie-scale anchors the value board shows as reference
// rows, so a board with nobody on it still tells a visitor what the numbers
// on it mean.
//
// These are BENCHMARKS, not competitors: they are excluded from the board's
// `total`, never ranked, and labelled in words on the row itself — the same
// move the accuracy leaderboard makes with the Elo model.
//
// The authoritative table lives in apps/valuation/rookie_scale.py, which is
// what actually prices a season. This file carries only the three picks the
// board displays, because shipping the whole 30-row scale into the API would
// be a second copy of a table that must not drift. The year is stated on
// every payload for the same reason: a figure from a superseded scale must
// never be silently re-read against a newer one.
//
// MAINTENANCE: the NBA publishes a new rookie scale each summer. When
// apps/valuation/rookie_scale.py is updated, these three figures and the year
// below have to move with it — nothing in the system will warn you.

export const ROOKIE_SCALE_YEAR = "2025-26";

export interface RookieScaleReference {
  label: string;
  draftSlot: number;
  valueUsd: number;
}

// Top of the lottery, the middle of the first round, and the last first-round
// pick — enough to read the board against without reprinting the scale.
export const ROOKIE_SCALE_REFERENCES: RookieScaleReference[] = [
  { label: "Pick 1", draftSlot: 1, valueUsd: 12_800_000 },
  { label: "Pick 14", draftSlot: 14, valueUsd: 4_400_000 },
  { label: "Pick 30", draftSlot: 30, valueUsd: 2_300_000 },
];
