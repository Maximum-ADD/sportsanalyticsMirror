import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEspnInjuryReport } from "./espn-injury-parser.js";
import { InjuryFeedUnavailableError } from "./injury-feed-unavailable.error.js";

// A trimmed copy of ESPN's real report from 2026-10-09: three teams, five injuries.
const FIXTURE = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/espn-injuries.json", import.meta.url)), "utf8"));

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    status: "Out",
    date: "2026-10-09T02:30Z",
    shortComment: "Out for the week.",
    type: { name: "INJURY_STATUS_OUT" },
    details: { type: "Ankle", side: "Right", detail: "Sprain", returnDate: "2026-10-20" },
    athlete: { displayName: "Test Player" },
    ...overrides,
  };
}

describe("parseEspnInjuryReport", () => {
  it("reads every entry in a real report, keeping only the fields the pages show", () => {
    const injuries = parseEspnInjuryReport(FIXTURE);

    expect(injuries).toHaveLength(5);
    expect(injuries[0]).toEqual({
      espnTeamName: "Atlanta Hawks",
      playerName: "Keshon Gilbert",
      status: "Day-To-Day",
      severity: "DAY_TO_DAY",
      bodyPart: "Knee",
      side: "Left",
      detail: "Tendinitis",
      expectedReturn: "2026-10-10",
      note: expect.stringContaining("patella tendinitis"),
      updatedAt: "2026-10-09T02:30:00.000Z",
    });
  });

  it("rates an Out entry as OUT, and reads ESPN's 'Not Specified' side as no side", () => {
    const injuries = parseEspnInjuryReport(FIXTURE);

    expect(injuries.find((injury) => injury.playerName === "Shaedon Sharpe")?.severity).toBe("OUT");
    expect(injuries.find((injury) => injury.playerName === "Bradley Beal")?.side).toBeNull();
  });

  it("drops an unreadable entry and keeps the rest", () => {
    const report = {
      injuries: [{ displayName: "Utah Jazz", injuries: [makeEntry(), { status: "Out" }] }],
    };

    expect(parseEspnInjuryReport(report).map((injury) => injury.playerName)).toEqual(["Test Player"]);
  });

  it("keeps an entry whose optional fields are missing or malformed, as nulls", () => {
    const report = {
      injuries: [
        {
          displayName: "Utah Jazz",
          injuries: [makeEntry({ type: null, details: { returnDate: "soon" }, shortComment: "", date: "not a date" })],
        },
      ],
    };

    expect(parseEspnInjuryReport(report)[0]).toMatchObject({
      severity: "OTHER",
      bodyPart: null,
      side: null,
      expectedReturn: null,
      note: null,
      updatedAt: null,
    });
  });

  it("accepts a report with no injuries at all", () => {
    expect(parseEspnInjuryReport({ injuries: [] })).toEqual([]);
  });

  it("calls the feed unavailable when its outer shape is wrong, or none of its entries can be read", () => {
    expect(() => parseEspnInjuryReport({ teams: [] })).toThrow(InjuryFeedUnavailableError);
    expect(() =>
      parseEspnInjuryReport({ injuries: [{ displayName: "Utah Jazz", injuries: [{ status: "Out" }, {}] }] })
    ).toThrow(InjuryFeedUnavailableError);
  });
});
