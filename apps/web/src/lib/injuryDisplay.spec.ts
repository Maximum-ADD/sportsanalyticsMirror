import { describe, expect, it } from "vitest";
import { formatExpectedReturn, formatInjuryDescription, formatInjuryStatus } from "./injuryDisplay";

describe("formatInjuryDescription", () => {
  it("puts the side and body part first, then the diagnosis", () => {
    expect(formatInjuryDescription({ side: "Left", bodyPart: "Knee", detail: "Tendinitis" })).toBe("Left knee · Tendinitis");
  });

  it("leaves out whatever ESPN didn't say", () => {
    expect(formatInjuryDescription({ side: null, bodyPart: "Ankle", detail: "Sprain" })).toBe("Ankle · Sprain");
    expect(formatInjuryDescription({ side: null, bodyPart: null, detail: "Illness" })).toBe("Illness");
    expect(formatInjuryDescription({ side: null, bodyPart: null, detail: null })).toBeNull();
  });
});

describe("formatExpectedReturn", () => {
  it("labels the date as ESPN's estimate", () => {
    expect(formatExpectedReturn("2027-03-02")).toBe("Expected return 2 Mar 2027 (ESPN estimate)");
  });

  it("returns null when ESPN gave no date", () => {
    expect(formatExpectedReturn(null)).toBeNull();
  });
});

describe("formatInjuryStatus", () => {
  it("uses short labels for out and day-to-day, and ESPN's wording otherwise", () => {
    expect(formatInjuryStatus({ severity: "OUT", status: "Out" })).toBe("Out");
    expect(formatInjuryStatus({ severity: "DAY_TO_DAY", status: "Day-To-Day" })).toBe("Day-to-day");
    expect(formatInjuryStatus({ severity: "OTHER", status: "Suspension" })).toBe("Suspension");
  });
});
