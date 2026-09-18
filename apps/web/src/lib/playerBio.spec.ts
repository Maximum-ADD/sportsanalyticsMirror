import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_VALUE, calculateAge, formatAge, formatHeight } from "./playerBio";

// Age depends on today's date, so every case here runs against a frozen clock.
const TODAY = new Date("2026-09-05T12:00:00.000Z");

describe("calculateAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts whole years for a birthday already past this year", () => {
    expect(calculateAge("1984-12-30")).toBe(41);
  });

  it("does not count the current year when the birthday is still to come", () => {
    expect(calculateAge("1984-12-30")).toBe(41);
    expect(calculateAge("1985-01-01")).toBe(41);
  });

  it("counts a birthday falling today as already reached", () => {
    expect(calculateAge("1990-09-05")).toBe(36);
  });

  it("does not count a birthday falling tomorrow", () => {
    expect(calculateAge("1990-09-06")).toBe(35);
  });

  it("returns null for a player whose bio has not been ingested", () => {
    expect(calculateAge(null)).toBeNull();
  });
});

describe("formatAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the age in whole years", () => {
    expect(formatAge("1984-12-30")).toBe("41");
  });

  it("falls back to a dash when there is no birthDate", () => {
    expect(formatAge(null)).toBe(NO_VALUE);
  });
});

describe("formatHeight", () => {
  it("splits total inches into feet and inches", () => {
    expect(formatHeight(81)).toBe("6'9\"");
  });

  it("renders an exact number of feet without stray inches", () => {
    expect(formatHeight(72)).toBe("6'0\"");
  });

  it("falls back to a dash when the height is unknown", () => {
    expect(formatHeight(null)).toBe(NO_VALUE);
  });
});
