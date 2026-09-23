import { describe, expect, it } from "vitest";
import {
  MINIMUM_GAMES_REQUIRED,
  describeRankState,
  qualifyProspects,
  rankProspects,
  type ProspectCandidate,
} from "./prospect-ranking.js";

function makeCandidate(overrides: Partial<ProspectCandidate> = {}): ProspectCandidate {
  return {
    username: "kiran",
    displayName: "Kiran",
    avatarUrl: null,
    competitionLevel: "NCAA_D2",
    gamesLogged: 14,
    pointsPerGame: 24.1,
    projectedDraftSlot: 18,
    projectedValueUsd: 4_368_000,
    reliabilityTier: "PARTIAL",
    verifiedCoverage: 0.3,
    ...overrides,
  };
}

describe("qualifyProspects", () => {
  it("keeps a season at the games floor", () => {
    const qualified = qualifyProspects([makeCandidate({ gamesLogged: MINIMUM_GAMES_REQUIRED })]);

    expect(qualified).toHaveLength(1);
  });

  // One enormous night must not outrank thirty games of real production.
  it("drops a season below the games floor", () => {
    const qualified = qualifyProspects([
      makeCandidate({ gamesLogged: MINIMUM_GAMES_REQUIRED - 1 }),
    ]);

    expect(qualified).toHaveLength(0);
  });

  it("drops a season the model has not valued yet", () => {
    const qualified = qualifyProspects([makeCandidate({ projectedValueUsd: null })]);

    expect(qualified).toHaveLength(0);
  });
});

describe("rankProspects", () => {
  it("orders by projected value, highest first", () => {
    const ranked = rankProspects([
      makeCandidate({ username: "b", projectedValueUsd: 2_000_000 }),
      makeCandidate({ username: "a", projectedValueUsd: 5_000_000 }),
    ]);

    expect(ranked.map((entry) => entry.username)).toEqual(["a", "b"]);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2]);
  });

  // Dense, not competition ranking: three level at the top are all #1 and the
  // next distinct value is #2, never #4.
  it("gives tied values the same rank and does not skip the next", () => {
    const ranked = rankProspects([
      makeCandidate({ username: "a", projectedValueUsd: 5_000_000 }),
      makeCandidate({ username: "b", projectedValueUsd: 5_000_000 }),
      makeCandidate({ username: "c", projectedValueUsd: 5_000_000 }),
      makeCandidate({ username: "d", projectedValueUsd: 1_000_000 }),
    ]);

    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1, 1, 2]);
  });

  // The same figure off thirty games is a stronger claim than off ten.
  it("places the larger sample higher within a tie", () => {
    const ranked = rankProspects([
      makeCandidate({ username: "small", gamesLogged: 10 }),
      makeCandidate({ username: "large", gamesLogged: 30 }),
    ]);

    expect(ranked[0].username).toBe("large");
    // Still the same rank — the ordering is a tiebreak, not a promotion.
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1]);
  });

  it("places the better-documented season higher when value and games match", () => {
    const ranked = rankProspects([
      makeCandidate({ username: "thin", verifiedCoverage: 0 }),
      makeCandidate({ username: "solid", verifiedCoverage: 0.9 }),
    ]);

    expect(ranked[0].username).toBe("solid");
  });

  // Without this the board flickers between identical requests.
  it("is deterministic for two otherwise identical seasons", () => {
    const candidates = [
      makeCandidate({ username: "zoe" }),
      makeCandidate({ username: "adam" }),
    ];

    expect(rankProspects(candidates).map((entry) => entry.username)).toEqual(
      rankProspects([...candidates].reverse()).map((entry) => entry.username)
    );
  });

  it("returns an empty board when nobody qualifies", () => {
    expect(rankProspects([makeCandidate({ gamesLogged: 2 })])).toEqual([]);
  });
});

describe("describeRankState", () => {
  it("names a ranked season", () => {
    expect(
      describeRankState({ isPublic: true, gamesLogged: 14, hasValuation: true, rank: 3 })
    ).toBe("RANKED");
  });

  // The whole reason this function exists: somebody with thirty games logged
  // must be able to tell a system fault from their own shortfall.
  it("distinguishes too-few-games from a missing valuation", () => {
    expect(
      describeRankState({ isPublic: true, gamesLogged: 7, hasValuation: false, rank: null })
    ).toBe("BELOW_GAMES_FLOOR");
    expect(
      describeRankState({ isPublic: true, gamesLogged: 30, hasValuation: false, rank: null })
    ).toBe("AWAITING_VALUATION");
  });

  it("reports a qualified season with a valuation but no rank as awaiting one", () => {
    expect(
      describeRankState({ isPublic: true, gamesLogged: 30, hasValuation: true, rank: null })
    ).toBe("AWAITING_VALUATION");
  });

  // Hidden wins over everything else — a private season is private whatever
  // its game count.
  it("reports a private season as hidden regardless of its games", () => {
    expect(
      describeRankState({ isPublic: false, gamesLogged: 40, hasValuation: true, rank: 1 })
    ).toBe("HIDDEN");
    expect(
      describeRankState({ isPublic: false, gamesLogged: 2, hasValuation: false, rank: null })
    ).toBe("HIDDEN");
  });
});
