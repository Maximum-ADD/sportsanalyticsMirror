import { describe, expect, it } from "vitest";
import {
  COMPETITION_LEVELS_IN_ORDER,
  COMPETITION_LEVEL_LABELS,
  PROSPECT_POSITIONS,
  describeValuationState,
  formatDraftSlot,
  formatProjectedValue,
  formatValueRange,
  hasAttempts,
  recentLeagueYears,
} from "./prospectValue";
import type { CompetitionLevel } from "@/types/nba";

describe("labels", () => {
  it("has a label for every competition level", () => {
    for (const level of COMPETITION_LEVELS_IN_ORDER) {
      expect(COMPETITION_LEVEL_LABELS[level]).toBeTruthy();
    }
  });

  // Guards against a level added to the union without a place in the picker,
  // which would otherwise be impossible to choose.
  it("orders every member of the CompetitionLevel union", () => {
    const declared = Object.keys(COMPETITION_LEVEL_LABELS) as CompetitionLevel[];
    expect([...COMPETITION_LEVELS_IN_ORDER].sort()).toEqual([...declared].sort());
  });

  it("offers the same positions the players list filters by", () => {
    expect(PROSPECT_POSITIONS).toEqual(["G", "F", "C", "G-F", "F-C"]);
  });
});

describe("formatProjectedValue", () => {
  it("renders millions to two decimals", () => {
    expect(formatProjectedValue(4_368_000)).toBe("$4.37M");
  });

  it("renders thousands to the nearest thousand", () => {
    expect(formatProjectedValue(820_000)).toBe("$820K");
  });

  it("renders small figures in full", () => {
    expect(formatProjectedValue(950)).toBe("$950");
  });

  // "Not valued yet" is not the same claim as "valued at nothing".
  it("renders an absent figure as an em dash, never as zero", () => {
    expect(formatProjectedValue(null)).toBe("—");
  });
});

describe("formatValueRange", () => {
  it("renders both ends", () => {
    expect(formatValueRange(3_100_000, 5_900_000)).toBe("$3.10M – $5.90M");
  });

  it("refuses half an interval", () => {
    expect(formatValueRange(3_100_000, null)).toBe("—");
    expect(formatValueRange(null, 5_900_000)).toBe("—");
  });
});

describe("formatDraftSlot", () => {
  it("names a first-round pick", () => {
    expect(formatDraftSlot(1)).toBe("Pick 1");
    expect(formatDraftSlot(30)).toBe("Pick 30");
  });

  it("collapses the second round", () => {
    expect(formatDraftSlot(31)).toBe("2nd round");
    expect(formatDraftSlot(60)).toBe("2nd round");
  });

  it("names the undrafted range past the draft", () => {
    expect(formatDraftSlot(61)).toBe("Undrafted range");
  });

  it("renders an absent slot as an em dash", () => {
    expect(formatDraftSlot(null)).toBe("—");
  });
});

describe("describeValuationState", () => {
  it("says nothing when the season is valued", () => {
    expect(describeValuationState("VALUED", 14, 10)).toBeNull();
  });

  it("counts the shortfall below the games floor", () => {
    expect(describeValuationState("BELOW_GAMES_FLOOR", 7, 10)).toContain("3 more games needed");
  });

  it("uses the singular for a one-game shortfall", () => {
    expect(describeValuationState("BELOW_GAMES_FLOOR", 9, 10)).toContain("1 more game needed");
  });

  // A missing model is the system's gap and must not read as the user's.
  it("distinguishes a missing model from missing games", () => {
    expect(describeValuationState("AWAITING_MODEL", 30, 10)).toMatch(/has not been trained/);
  });

  it("treats a brand-new season as needing the full floor", () => {
    expect(describeValuationState(null, 0, 10)).toContain("10 more games needed");
  });
});

describe("hasAttempts", () => {
  it("distinguishes a real zero percentage from a meaningless one", () => {
    expect(hasAttempts(4.2)).toBe(true);
    expect(hasAttempts(0)).toBe(false);
  });
});

describe("recentLeagueYears", () => {
  // From July the new league year is the current one.
  it("starts from the new season once the summer rollover has passed", () => {
    expect(recentLeagueYears(new Date(2026, 8, 26))[0]).toBe("2026-27");
  });

  it("stays on the previous season before the rollover", () => {
    expect(recentLeagueYears(new Date(2026, 2, 1))[0]).toBe("2025-26");
  });

  it("lists newest first in the Game.season format", () => {
    expect(recentLeagueYears(new Date(2026, 2, 1), 3)).toEqual(["2025-26", "2024-25", "2023-24"]);
  });

  it("zero-pads across a decade boundary", () => {
    expect(recentLeagueYears(new Date(2009, 2, 1), 1)).toEqual(["2008-09"]);
  });
});
