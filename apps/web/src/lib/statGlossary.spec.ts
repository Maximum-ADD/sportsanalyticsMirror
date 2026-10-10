import { describe, expect, it } from "vitest";
import { STAT_GLOSSARY, describeStat, requireStat } from "./statGlossary";

describe("statGlossary", () => {
  it("gives the same definition to labels that name the same stat", () => {
    // The tiles print PPG where the radar prints PTS/G; one stat, one wording.
    expect(requireStat("PPG")).toBe(requireStat("PTS/G"));
    expect(requireStat("STL")).toBe(requireStat("SPG"));
    expect(requireStat("USG%")).toBe(requireStat("Usage %"));
  });

  it("says which direction is better for the two ratings", () => {
    expect(requireStat("ORTG").explain).toMatch(/higher is better/i);
    expect(requireStat("DRTG").explain).toMatch(/lower is better/i);
  });

  it("returns nothing for a plain word, and throws for a label that ought to be known", () => {
    expect(describeStat("Season")).toBeUndefined();
    expect(() => requireStat("PPGG")).toThrow(/PPGG/);
  });

  it("has a short name and a full sentence for every entry", () => {
    for (const [label, definition] of Object.entries(STAT_GLOSSARY)) {
      expect(definition.name, label).not.toBe("");
      // Short enough to sit under a stat tile.
      expect(definition.name.length, label).toBeLessThanOrEqual(32);
      expect(definition.explain.length, label).toBeGreaterThan(definition.name.length);
    }
  });
});
