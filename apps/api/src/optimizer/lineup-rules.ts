// The roster rules every lineup in this app follows. They mirror the
// constants at the top of apps/optimizer/optimize.py; keep the two equal.
// The on-demand solver (lineup-solver.ts) and the saved-lineup checks
// (me/saved-lineups.service.ts) both read them from here, so the API can
// never solve under one set of rules and refuse to save under another.
//
// These are this app's own rules, not a real contest's: a real DFS classic
// roster has named slots (PG/SG/SF/PF/C/G/F/UTIL) and a different size.

export const LINEUP_SIZE = 5;
export const SALARY_CAP_IN_DOLLARS = 50_000;
export const MINIMUM_GUARDS = 1;
export const MINIMUM_FORWARDS = 1;

// Position eligibility is a substring test, the same one optimize.py uses,
// so a combo listing like "G-F" counts toward both minimums.
export function isGuard(position: string): boolean {
  return position.includes("G");
}

export function isForward(position: string): boolean {
  return position.includes("F");
}
