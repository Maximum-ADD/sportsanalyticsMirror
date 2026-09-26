import { describe, expect, it } from "vitest";
import type { AdminGameEvent, AdminRosterPlayer } from "@/lib/adminApi";
import {
  buildCorrectionBody,
  createPlayForm,
  creditCandidates,
  creditStatFor,
  dropInvalidCredit,
  formatPeriod,
  splitDescription,
  valueForPlay,
  type PlayFormState,
} from "./playCorrection";

const HOME = "team-gsw";
const AWAY = "team-lal";

const ROSTER: AdminRosterPlayer[] = [
  { id: "curry", firstName: "Stephen", lastName: "Curry", teamId: HOME },
  { id: "green", firstName: "Draymond", lastName: "Green", teamId: HOME },
  { id: "thompson", firstName: "Klay", lastName: "Thompson", teamId: HOME },
  { id: "james", firstName: "LeBron", lastName: "James", teamId: AWAY },
];

function makeEvent(overrides: Partial<AdminGameEvent> = {}): AdminGameEvent {
  return {
    sequence: 1,
    period: 1,
    clock: "PT11M30.00S",
    eventType: "3pt",
    subType: "Jump Shot",
    playerId: "curry",
    playerName: "Stephen Curry",
    teamId: HOME,
    success: true,
    value: 3,
    description: "Curry 26' 3PT Jump Shot (3 PTS) (Green 1 AST)",
    creditPlayerId: "green",
    isCorrected: false,
    ...overrides,
  };
}

function formFor(event: AdminGameEvent, overrides: Partial<PlayFormState> = {}): PlayFormState {
  return { ...createPlayForm(event), reason: "fix", ...overrides };
}

describe("labels and credit rules", () => {
  it("formats quarters and overtimes", () => {
    expect(formatPeriod(4)).toBe("Q4");
    expect(formatPeriod(5)).toBe("OT1");
  });

  it("knows which credit each play takes", () => {
    expect(creditStatFor("3pt", true)).toBe("assists");
    expect(creditStatFor("2pt", false)).toBe("blocks");
    expect(creditStatFor("turnover", null)).toBe("steals");
    expect(creditStatFor("rebound", null)).toBeNull();
  });

  it("splits the credit suffix off the description text", () => {
    expect(splitDescription("Curry 26' 3PT Jump Shot (3 PTS) (Green 1 AST)")).toEqual({
      text: "Curry 26' 3PT Jump Shot (3 PTS)",
      creditSuffix: " (Green 1 AST)",
    });
  });

  it("keeps a value that fits and resets one that doesn't", () => {
    expect(valueForPlay("2pt", true, 3)).toBe(2);
    expect(valueForPlay("3pt", false, 3)).toBe(3);
    expect(valueForPlay("freethrow", true, 2)).toBe(0);
    expect(valueForPlay("rebound", null, 3)).toBe(0);
    expect(valueForPlay("rebound", null, null)).toBeNull();
  });

  it("offers acting teammates for an assist and opponents for a block or steal, never the shooter", () => {
    const acting = new Set(["curry", "green", "james"]);
    const ids = (players: AdminRosterPlayer[]) => players.map((player) => player.id);
    expect(ids(creditCandidates("assists", { playerId: "curry", teamId: HOME }, ROSTER, acting))).toEqual(["green"]);
    expect(ids(creditCandidates("blocks", { playerId: "curry", teamId: HOME }, ROSTER, acting))).toEqual(["james"]);
  });
});

describe("dropInvalidCredit", () => {
  const event = makeEvent();

  it("keeps the credit through unrelated edits", () => {
    const previous = formFor(event);
    expect(dropInvalidCredit(previous, { ...previous, clock: "11:00" }, ROSTER).creditPlayerId).toBe("green");
  });

  it("drops it when the credited player becomes the shooter", () => {
    const previous = formFor(event);
    expect(dropInvalidCredit(previous, { ...previous, playerId: "green" }, ROSTER).creditPlayerId).toBe("");
  });

  it("drops it when the play takes a different credit", () => {
    const previous = formFor(event);
    expect(dropInvalidCredit(previous, { ...previous, madeOrMissed: "missed" }, ROSTER).creditPlayerId).toBe("");
  });
});

describe("buildCorrectionBody", () => {
  it("sends only what changed, plus the reason", () => {
    const event = makeEvent();
    expect(buildCorrectionBody(event, formFor(event, { playerId: "thompson" }))).toEqual({
      body: { playerId: "thompson", reason: "fix" },
    });
  });

  it("converts a typed clock back to the stored form", () => {
    const event = makeEvent();
    expect(buildCorrectionBody(event, formFor(event, { clock: "7:45" }))).toEqual({
      body: { clock: "PT07M45.00S", reason: "fix" },
    });
  });

  it("changes value with the play type, and sends a changed credit", () => {
    const event = makeEvent();
    expect(buildCorrectionBody(event, formFor(event, { eventType: "2pt", creditPlayerId: "thompson" }))).toEqual({
      body: { eventType: "2pt", value: 2, creditPlayerId: "thompson", reason: "fix" },
    });
  });

  it("clears the credit when the play can no longer take one", () => {
    const event = makeEvent();
    expect(buildCorrectionBody(event, formFor(event, { madeOrMissed: "missed", creditPlayerId: "" }))).toEqual({
      body: { success: false, creditPlayerId: null, reason: "fix" },
    });
  });

  it("classifies a rebound, and clears a rebound's kind when it becomes another play", () => {
    const rebound = makeEvent({
      eventType: "rebound", subType: null, success: null, value: 0, description: "Green REBOUND", creditPlayerId: null,
    });
    expect(buildCorrectionBody(rebound, formFor(rebound, { reboundKind: "offensive" }))).toEqual({
      body: { subType: "offensive", reason: "fix" },
    });
    const classified = { ...rebound, subType: "defensive" };
    expect(buildCorrectionBody(classified, formFor(classified, { eventType: "turnover" }))).toEqual({
      body: { eventType: "turnover", subType: null, creditPlayerId: null, reason: "fix" },
    });
  });

  it("keeps the credit suffix when the description text is edited", () => {
    const event = makeEvent();
    expect(buildCorrectionBody(event, formFor(event, { descriptionText: "Thompson 26' 3PT Jump Shot (3 PTS)" }))).toEqual({
      body: { description: "Thompson 26' 3PT Jump Shot (3 PTS) (Green 1 AST)", reason: "fix" },
    });
  });

  it("explains what's missing instead of building a request", () => {
    const event = makeEvent();
    expect(buildCorrectionBody(event, formFor(event, { reason: " " }))).toEqual({ error: "Give a reason for this correction." });
    expect(buildCorrectionBody(event, formFor(event, { clock: "7:5" }))).toEqual({ error: expect.stringMatching(/Clock must be m:ss/) });
    expect(buildCorrectionBody(event, formFor(event, { madeOrMissed: "" }))).toEqual({ error: "Choose made or missed." });
    expect(buildCorrectionBody(event, formFor(event))).toEqual({ error: "Nothing has changed yet." });
  });
});
