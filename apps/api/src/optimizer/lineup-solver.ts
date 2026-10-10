import { isForward, isGuard, LINEUP_SIZE, MINIMUM_FORWARDS, MINIMUM_GUARDS } from "./lineup-rules.js";

// The on-demand lineup solver behind POST /v1/optimizer/solve.
//
// apps/optimizer/optimize.py solves the same problem with PuLP and CBC, but
// only as a batch job: the deployed API is a Node-only process with no
// Python, and a lineup with a user's own locks can't be computed ahead of
// time. So the API solves here, in TypeScript, under the same rules.
//
// The problem is a 0/1 knapsack with a fixed item count and two position
// minimums, which an exact dynamic program solves faster than a general MILP
// solver would. The table is indexed by
//   (players picked so far, position coverage so far, salary spent)
// where salary is counted in units of the largest amount that divides every
// candidate's salary. predict.py prices players in $100 steps, so a $50,000
// cap is about 500 columns. Each cell keeps the best `lineupCount` distinct
// player sets that reach it, not just the best one, so the top-k lineups come
// out of a single pass. Points are compared in whole hundredths: predictions
// are stored to two decimals, so the arithmetic is exact and a tie is a tie.

/** One player the solver may pick: their latest projection and synthetic salary. */
export interface SolverCandidate {
  id: string;
  // Only used to name players in infeasibility messages.
  name: string;
  position: string;
  predictedFantasyPoints: number;
  salary: number;
}

/** What the caller asks for. Ids are deduplicated here, so callers don't have to. */
export interface LineupRequest {
  budget: number;
  // Players every returned lineup must include.
  lockedPlayerIds: readonly string[];
  // Players no returned lineup may include.
  excludedPlayerIds: readonly string[];
  // How many lineups to return: the best one, then the next-best distinct ones.
  lineupCount: number;
}

export interface SolvedLineup {
  // Highest projection first.
  players: SolverCandidate[];
  totalPredictedPoints: number;
  totalSalary: number;
}

export type SolveResult =
  | { feasible: true; lineups: SolvedLineup[] }
  | { feasible: false; reason: string };

// Position coverage, counted up to each minimum and no further: once a lineup
// has its one guard, a second guard doesn't change what it still needs. With
// both minimums at 1 that is four states (needs both, needs a guard, needs a
// forward, needs nothing).
const FORWARD_LEVELS = MINIMUM_FORWARDS + 1;
const COVERAGE_STATES = (MINIMUM_GUARDS + 1) * FORWARD_LEVELS;
const FULL_COVERAGE = coverageIndex(MINIMUM_GUARDS, MINIMUM_FORWARDS);

// Marks an empty entry in the table of best point totals.
const NO_LINEUP = -2_147_483_648;

// A cap on the table's size. With $100 salary steps the table is tens of
// thousands of entries; this only trips if salaries stop sharing a common
// step (say, priced to the dollar), which would make the table hundreds of
// times larger. Better to fail loudly than to stall the API process.
const MAX_TABLE_ENTRIES = 4_000_000;

function coverageIndex(guards: number, forwards: number): number {
  return Math.min(guards, MINIMUM_GUARDS) * FORWARD_LEVELS + Math.min(forwards, MINIMUM_FORWARDS);
}

function guardsCovered(coverage: number): number {
  return Math.floor(coverage / FORWARD_LEVELS);
}

function forwardsCovered(coverage: number): number {
  return coverage % FORWARD_LEVELS;
}

function addToCoverage(coverage: number, candidate: SolverCandidate): number {
  return coverageIndex(
    guardsCovered(coverage) + (isGuard(candidate.position) ? 1 : 0),
    forwardsCovered(coverage) + (isForward(candidate.position) ? 1 : 0)
  );
}

function toHundredths(points: number): number {
  return Math.round(points * 100);
}

function greatestCommonDivisor(a: number, b: number): number {
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function formatDollars(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

// "A", "A and B", "A, B and C".
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// What a lineup at this coverage still lacks, e.g. "a guard and a forward".
function describeMissingPositions(coverage: number): string {
  const missing: string[] = [];
  if (guardsCovered(coverage) < MINIMUM_GUARDS) missing.push(MINIMUM_GUARDS === 1 ? "a guard" : `${MINIMUM_GUARDS} guards`);
  if (forwardsCovered(coverage) < MINIMUM_FORWARDS) {
    missing.push(MINIMUM_FORWARDS === 1 ? "a forward" : `${MINIMUM_FORWARDS} forwards`);
  }
  return joinNames(missing);
}

function summarize(players: SolverCandidate[]): SolvedLineup {
  const ordered = [...players].sort(
    (a, b) => b.predictedFantasyPoints - a.predictedFantasyPoints || a.id.localeCompare(b.id)
  );
  return {
    players: ordered,
    totalPredictedPoints: ordered.reduce((sum, player) => sum + toHundredths(player.predictedFantasyPoints), 0) / 100,
    totalSalary: ordered.reduce((sum, player) => sum + player.salary, 0),
  };
}

/**
 * The cheapest salary that fills `openSlots` more slots from `candidates`
 * and reaches full position coverage, ignoring the budget. Null when no
 * choice of players can meet the position rules at all.
 *
 * This is what lets an infeasible request get a specific answer ("the
 * cheapest legal fill costs $X") instead of a bare "no lineup found". It is
 * a small table of its own: (players picked, coverage) -> cheapest salary.
 */
function cheapestLegalFill(candidates: SolverCandidate[], openSlots: number, startCoverage: number): number | null {
  const cheapest = new Array<number>((openSlots + 1) * COVERAGE_STATES).fill(Number.POSITIVE_INFINITY);
  cheapest[startCoverage] = 0;
  for (const candidate of candidates) {
    for (let count = openSlots - 1; count >= 0; count--) {
      for (let coverage = 0; coverage < COVERAGE_STATES; coverage++) {
        const spent = cheapest[count * COVERAGE_STATES + coverage];
        if (spent === Number.POSITIVE_INFINITY) continue;
        const target = (count + 1) * COVERAGE_STATES + addToCoverage(coverage, candidate);
        cheapest[target] = Math.min(cheapest[target], spent + candidate.salary);
      }
    }
  }
  const best = cheapest[openSlots * COVERAGE_STATES + FULL_COVERAGE];
  return best === Number.POSITIVE_INFINITY ? null : best;
}

// Why no choice of players can meet the position rules. With both minimums
// at 1 there are only a few ways that happens, and each has its own fix.
function describePositionConflict(candidates: SolverCandidate[], openSlots: number, startCoverage: number): string {
  const missing = describeMissingPositions(startCoverage);
  if (openSlots === 0) {
    return (
      `All ${LINEUP_SIZE} slots are locked, but the locked players don't include ${missing}. ` +
      `Every lineup needs at least ${MINIMUM_GUARDS} guard and ${MINIMUM_FORWARDS} forward, so unlock one of them.`
    );
  }
  if (candidates.length < openSlots) {
    return (
      `Only ${pluralize(candidates.length, "player")} ${candidates.length === 1 ? "is" : "are"} left to pick from ` +
      `once locked and excluded players are set aside, but the lineup needs ` +
      `${openSlots === LINEUP_SIZE ? openSlots : `${openSlots} more`}.`
    );
  }
  if (guardsCovered(startCoverage) < MINIMUM_GUARDS && !candidates.some((c) => isGuard(c.position))) {
    return "No guard is left to pick from once excluded players are set aside. Remove an exclusion or lock a guard.";
  }
  if (forwardsCovered(startCoverage) < MINIMUM_FORWARDS && !candidates.some((c) => isForward(c.position))) {
    return "No forward is left to pick from once excluded players are set aside. Remove an exclusion or lock a forward.";
  }
  return (
    `Your locks leave ${pluralize(openSlots, "open slot")}, which isn't room for ${missing}, ` +
    "and no remaining player is listed as both a guard and a forward. Unlock a player, or lock a guard or forward instead."
  );
}

/**
 * Drops candidates that can't appear in any of the top `lineupCount`
 * lineups, to keep the table small. A candidate is dropped when at least
 * (openSlots + lineupCount - 1) others are no more expensive, project at
 * least as many points, and cover every position need it covers: any lineup
 * using it leaves at least `lineupCount` of those others unused, and
 * swapping any one of them in gives a different lineup that is at least as
 * good. So the top lineups never need it (up to exact ties, which are
 * broken arbitrarily anyway). With synthetic salaries, hundreds of
 * minimum-salary bench players go this way.
 */
function dropDominatedCandidates(
  candidates: SolverCandidate[],
  openSlots: number,
  startCoverage: number,
  lineupCount: number
): SolverCandidate[] {
  const threshold = openSlots + lineupCount - 1;
  const guardStillNeeded = guardsCovered(startCoverage) < MINIMUM_GUARDS;
  const forwardStillNeeded = forwardsCovered(startCoverage) < MINIMUM_FORWARDS;
  // Which of the still-open position needs a player helps with: bit 1 a
  // guard need, bit 2 a forward need.
  const needsCovered = (candidate: SolverCandidate) =>
    (guardStillNeeded && isGuard(candidate.position) ? 1 : 0) | (forwardStillNeeded && isForward(candidate.position) ? 2 : 0);
  const bitCount = (bits: number) => (bits & 1) + ((bits >> 1) & 1);

  // Cheapest first, so everyone already seen is no more expensive.
  const ordered = [...candidates].sort(
    (a, b) =>
      a.salary - b.salary ||
      toHundredths(b.predictedFantasyPoints) - toHundredths(a.predictedFantasyPoints) ||
      bitCount(needsCovered(b)) - bitCount(needsCovered(a)) ||
      a.id.localeCompare(b.id)
  );
  // The highest projections kept so far, per needs-covered bit pattern. Only
  // the top `threshold` of each matter for the count.
  const keptPointsByNeeds: number[][] = [[], [], [], []];
  const kept: SolverCandidate[] = [];
  for (const candidate of ordered) {
    const needs = needsCovered(candidate);
    const points = toHundredths(candidate.predictedFantasyPoints);
    let dominators = 0;
    for (let otherNeeds = 0; otherNeeds < 4; otherNeeds++) {
      if ((otherNeeds & needs) !== needs) continue;
      for (const otherPoints of keptPointsByNeeds[otherNeeds]) {
        if (otherPoints >= points) dominators++;
      }
    }
    if (dominators >= threshold) continue;
    kept.push(candidate);
    const list = keptPointsByNeeds[needs];
    list.push(points);
    list.sort((a, b) => b - a);
    if (list.length > threshold) list.length = threshold;
  }
  return kept;
}

/**
 * The top `lineupCount` distinct ways to fill `openSlots` slots from
 * `candidates` within `budgetLeft`, reaching full position coverage. Each
 * result is a list of candidates; best first, ties broken by lower salary.
 *
 * Callers have already checked that at least one such fill exists.
 */
function findTopFills(
  allCandidates: SolverCandidate[],
  openSlots: number,
  budgetLeft: number,
  startCoverage: number,
  lineupCount: number
): SolverCandidate[][] {
  if (openSlots === 0) return [[]];

  const affordable = allCandidates.filter((candidate) => candidate.salary <= budgetLeft);
  const candidates = dropDominatedCandidates(affordable, openSlots, startCoverage, lineupCount).sort(
    (a, b) => b.predictedFantasyPoints - a.predictedFantasyPoints || a.id.localeCompare(b.id)
  );

  let salaryUnit = 0;
  for (const candidate of candidates) salaryUnit = greatestCommonDivisor(salaryUnit, candidate.salary);
  if (salaryUnit === 0) salaryUnit = 1;
  const costs = candidates.map((candidate) => candidate.salary / salaryUnit);
  const gains = candidates.map((candidate) => toHundredths(candidate.predictedFantasyPoints));
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  // No fill can spend more than the open slots' most expensive candidates,
  // so the table needn't be wider than that even under a huge budget.
  const priciestFill = [...costs].sort((a, b) => b - a).slice(0, openSlots).reduce((sum, cost) => sum + cost, 0);
  const maxSpend = Math.min(Math.floor(budgetLeft / salaryUnit), priciestFill);

  const K = lineupCount;
  const width = maxSpend + 1;
  const layer = COVERAGE_STATES * width;
  const stateCount = (openSlots + 1) * layer;
  if (stateCount * K * (openSlots + 1) > MAX_TABLE_ENTRIES) {
    throw new Error(
      `Lineup solver table too large (${stateCount} states): salaries share no common step above $${salaryUnit}`
    );
  }
  // best[state * K + j] is the j-th best point total reaching that state;
  // picks[(state * K + j) * openSlots + t] is the t-th candidate in it.
  const best = new Int32Array(stateCount * K).fill(NO_LINEUP);
  const picks = new Int32Array(stateCount * K * openSlots);
  best[startCoverage * width * K] = 0;

  // Only coverage states reachable from where the locked players left off.
  const reachableCoverages: number[] = [];
  for (let coverage = 0; coverage < COVERAGE_STATES; coverage++) {
    if (
      guardsCovered(coverage) >= guardsCovered(startCoverage) &&
      forwardsCovered(coverage) >= forwardsCovered(startCoverage)
    ) {
      reachableCoverages.push(coverage);
    }
  }

  for (let i = 0; i < candidates.length; i++) {
    const cost = costs[i];
    const gain = gains[i];
    // Counting down means each candidate is added at most once: the states
    // read below were written before this candidate was considered.
    for (let count = Math.min(i, openSlots - 1); count >= 0; count--) {
      // A state with `count` picks spent at least count * minCost and at
      // most count * maxCost; skipping the rest of the row saves most of
      // the work.
      const lowestSpend = count * minCost;
      const highestSpend = Math.min(maxSpend - cost, count * maxCost);
      for (const coverage of reachableCoverages) {
        const fromRow = count * layer + coverage * width;
        const toRow = (count + 1) * layer + addToCoverage(coverage, candidates[i]) * width + cost;
        for (let spend = highestSpend; spend >= lowestSpend; spend--) {
          const from = (fromRow + spend) * K;
          if (best[from] === NO_LINEUP) continue;
          const to = (toRow + spend) * K;
          // Merge `from`'s entries (plus this candidate) into `to`'s sorted
          // list. Both lists are sorted, so the first entry that doesn't
          // beat `to`'s worst means none of the rest will either.
          for (let j = 0; j < K; j++) {
            const previous = best[from + j];
            if (previous === NO_LINEUP) break;
            const total = previous + gain;
            if (total <= best[to + K - 1]) break;
            let position = K - 1;
            while (position > 0 && best[to + position - 1] < total) position--;
            for (let shifted = K - 1; shifted > position; shifted--) {
              best[to + shifted] = best[to + shifted - 1];
              picks.copyWithin((to + shifted) * openSlots, (to + shifted - 1) * openSlots, (to + shifted - 1) * openSlots + count + 1);
            }
            best[to + position] = total;
            picks.copyWithin((to + position) * openSlots, (from + j) * openSlots, (from + j) * openSlots + count);
            picks[(to + position) * openSlots + count] = i;
          }
        }
      }
    }
  }

  // Every full, legal fill sits at (openSlots picked, full coverage, some
  // spend). Each player set reaches exactly one cell by exactly one path,
  // so the entries are already distinct sets.
  const fills: { points: number; salary: number; players: SolverCandidate[] }[] = [];
  const finalRow = openSlots * layer + FULL_COVERAGE * width;
  for (let spend = 0; spend <= maxSpend; spend++) {
    const state = (finalRow + spend) * K;
    for (let j = 0; j < K && best[state + j] !== NO_LINEUP; j++) {
      const players: SolverCandidate[] = [];
      for (let t = 0; t < openSlots; t++) players.push(candidates[picks[(state + j) * openSlots + t]]);
      fills.push({ points: best[state + j], salary: spend * salaryUnit, players });
    }
  }
  fills.sort((a, b) => b.points - a.points || a.salary - b.salary);
  return fills.slice(0, K).map((fill) => fill.players);
}

/**
 * Finds the highest-projected lineups that follow the roster rules
 * (lineup-rules.ts), fit the budget, include every locked player and leave
 * out every excluded one.
 *
 * Returns up to `lineupCount` lineups: the best, then the next best, each a
 * different set of players from all the others (at least one player
 * differs). Fewer come back only when fewer legal lineups exist.
 *
 * When the rules can't all be met, returns a reason in plain English that
 * names what to change, rather than a bare "infeasible". Each check below
 * matches one way that happens, and the last two together guarantee the
 * search itself finds a lineup.
 */
export function solveLineups(pool: readonly SolverCandidate[], request: LineupRequest): SolveResult {
  const lockedIds = [...new Set(request.lockedPlayerIds)];
  const excludedIds = new Set(request.excludedPlayerIds);
  const poolById = new Map(pool.map((candidate) => [candidate.id, candidate]));
  const nameOf = (id: string) => poolById.get(id)?.name ?? id;

  const lockedAndExcluded = lockedIds.filter((id) => excludedIds.has(id));
  if (lockedAndExcluded.length > 0) {
    return {
      feasible: false,
      reason:
        `${joinNames(lockedAndExcluded.map(nameOf))} ${lockedAndExcluded.length === 1 ? "is" : "are"} both locked and excluded. ` +
        "A player can't be required and left out at once, so remove one of the two.",
    };
  }

  if (lockedIds.length > LINEUP_SIZE) {
    return {
      feasible: false,
      reason:
        `You locked ${lockedIds.length} players, but a lineup has only ${LINEUP_SIZE} slots. ` +
        `Unlock ${lockedIds.length - LINEUP_SIZE} of them.`,
    };
  }

  const unprojected = lockedIds.filter((id) => !poolById.has(id));
  if (unprojected.length > 0) {
    return {
      feasible: false,
      reason:
        `No projection exists for locked player ${joinNames(unprojected)}, so the solver has no points or salary ` +
        `to plan with. Unlock ${unprojected.length === 1 ? "that player" : "those players"}.`,
    };
  }

  const locked = lockedIds.map((id) => poolById.get(id)!);
  const lockedSalary = locked.reduce((sum, player) => sum + player.salary, 0);
  if (lockedSalary > request.budget) {
    return {
      feasible: false,
      reason:
        `Your locked players cost ${formatDollars(lockedSalary)} together, which is ` +
        `${formatDollars(lockedSalary - request.budget)} over the ${formatDollars(request.budget)} budget. Unlock one of them.`,
    };
  }

  const lockedIdSet = new Set(lockedIds);
  const candidates = pool.filter((candidate) => !lockedIdSet.has(candidate.id) && !excludedIds.has(candidate.id));
  const openSlots = LINEUP_SIZE - locked.length;
  const startCoverage = locked.reduce(addToCoverage, coverageIndex(0, 0));

  const cheapestFill = cheapestLegalFill(candidates, openSlots, startCoverage);
  if (cheapestFill === null) {
    return { feasible: false, reason: describePositionConflict(candidates, openSlots, startCoverage) };
  }

  const budgetLeft = request.budget - lockedSalary;
  if (cheapestFill > budgetLeft) {
    const shortfall = formatDollars(cheapestFill - budgetLeft);
    return {
      feasible: false,
      reason:
        locked.length === 0
          ? `The cheapest lineup that meets the roster rules costs ${formatDollars(cheapestFill)}, ` +
            `${shortfall} over the ${formatDollars(request.budget)} budget.`
          : `Your locked players cost ${formatDollars(lockedSalary)}, leaving ${formatDollars(budgetLeft)} ` +
            `of the ${formatDollars(request.budget)} budget for ${pluralize(openSlots, "more player")}. ` +
            (openSlots === 1
              ? `The cheapest player who keeps the lineup legal costs ${formatDollars(cheapestFill)}`
              : `The cheapest ${openSlots} players who keep the lineup legal cost ${formatDollars(cheapestFill)}`) +
            `, ${shortfall} too much. Unlock a player or raise the budget.`,
    };
  }

  const fills = findTopFills(candidates, openSlots, budgetLeft, startCoverage, request.lineupCount);
  return { feasible: true, lineups: fills.map((fill) => summarize([...locked, ...fill])) };
}
