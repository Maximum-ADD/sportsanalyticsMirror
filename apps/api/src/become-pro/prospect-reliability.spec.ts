import { describe, expect, it } from "vitest";
import {
  STRONG_COVERAGE_THRESHOLD,
  calculateProspectReliability,
  type ProspectGameEvidenceState,
} from "./prospect-reliability.js";

function games(
  counts: { verified?: number; pending?: number; bare?: number }
): ProspectGameEvidenceState[] {
  const verified = Array.from({ length: counts.verified ?? 0 }, () => ({
    hasEvidence: true,
    isVerified: true,
  }));
  const pending = Array.from({ length: counts.pending ?? 0 }, () => ({
    hasEvidence: true,
    isVerified: false,
  }));
  const bare = Array.from({ length: counts.bare ?? 0 }, () => ({
    hasEvidence: false,
    isVerified: false,
  }));
  return [...verified, ...pending, ...bare];
}

describe("calculateProspectReliability", () => {
  // The likeliest bug in the whole feature, pinned in both directions: an
  // absent score and a measured zero are different facts.
  it("returns a null score only when no games are logged", () => {
    expect(calculateProspectReliability([]).score).toBeNull();
  });

  it("returns a real zero score for logged games with nothing behind them", () => {
    const reliability = calculateProspectReliability(games({ bare: 12 }));

    expect(reliability.score).toBe(0);
    expect(reliability.gamesLogged).toBe(12);
    expect(reliability.tier).toBe("UNDOCUMENTED");
  });

  it("counts verified and merely documented games separately", () => {
    const reliability = calculateProspectReliability(games({ verified: 4, pending: 5, bare: 5 }));

    expect(reliability.gamesLogged).toBe(14);
    expect(reliability.gamesVerified).toBe(4);
    expect(reliability.gamesDocumented).toBe(9);
  });

  it("reports coverage as a rounded ratio rather than float noise", () => {
    const reliability = calculateProspectReliability(games({ verified: 4, bare: 10 }));

    expect(reliability.verifiedCoverage).toBe(0.2857);
  });

  describe("tiers", () => {
    it("calls a fully unverified season undocumented", () => {
      expect(calculateProspectReliability(games({ pending: 10 })).tier).toBe("UNDOCUMENTED");
    });

    it("calls a partly verified season partial", () => {
      expect(calculateProspectReliability(games({ verified: 1, bare: 9 })).tier).toBe("PARTIAL");
    });

    it("calls a well verified season strong at the threshold", () => {
      const verified = Math.round(STRONG_COVERAGE_THRESHOLD * 10);
      expect(
        calculateProspectReliability(games({ verified, bare: 10 - verified })).tier
      ).toBe("STRONG");
    });
  });

  // Uploading a pile of unreviewed files must not be able to reach STRONG:
  // the point of the tier is that somebody checked.
  it("cannot reach strong on pending uploads alone", () => {
    const reliability = calculateProspectReliability(games({ pending: 20 }));

    expect(reliability.tier).toBe("UNDOCUMENTED");
    expect(reliability.score).toBeLessThan(STRONG_COVERAGE_THRESHOLD * 100);
  });

  it("scores a fully verified season at 100", () => {
    expect(calculateProspectReliability(games({ verified: 10 })).score).toBe(100);
  });

  // A rejected scoresheet was looked at and found wanting, which is weaker
  // than making no claim — so it earns nothing, exactly like a bare game.
  it("gives a rejected document no credit", () => {
    const rejected = calculateProspectReliability(games({ bare: 10 }));
    const nothing = calculateProspectReliability(
      Array.from({ length: 10 }, () => ({ hasEvidence: false, isVerified: false }))
    );

    expect(rejected.score).toBe(nothing.score);
  });

  it("rates a pending upload above nothing at all", () => {
    const pending = calculateProspectReliability(games({ pending: 10 }));
    const bare = calculateProspectReliability(games({ bare: 10 }));

    expect(pending.score).toBeGreaterThan(bare.score as number);
  });
});
