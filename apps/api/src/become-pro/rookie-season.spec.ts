import { describe, expect, it } from "vitest";
import { rookieSeasonLabel } from "./rookie-season.js";

describe("rookieSeasonLabel", () => {
  it("puts a June draftee's rookie year in the following season", () => {
    expect(rookieSeasonLabel(2023)).toBe("2023-24");
  });

  it("zero-pads a two-digit year that would otherwise lose its leading zero", () => {
    expect(rookieSeasonLabel(2008)).toBe("2008-09");
  });

  it("wraps the century correctly", () => {
    expect(rookieSeasonLabel(1999)).toBe("1999-00");
  });
});
