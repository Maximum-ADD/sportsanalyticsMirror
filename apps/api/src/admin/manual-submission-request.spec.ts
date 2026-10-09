import { describe, expect, it } from "vitest";
import {
  MAX_EVENTS_PER_SUBMISSION,
  parseManualSubmissionBody,
  validateSubmittedEvents,
  type SubmissionContext,
  type SubmittedEvent,
} from "./manual-submission-request.js";

const HOME_TEAM = "home-team";
const AWAY_TEAM = "away-team";
const CURRY = "curry-id";
const GREEN = "green-id";

function madeTwo(overrides: Partial<SubmittedEvent> = {}): SubmittedEvent {
  return {
    sequence: 1,
    period: 1,
    clock: "PT11M30.00S",
    eventType: "2pt",
    subType: null,
    playerId: CURRY,
    teamId: HOME_TEAM,
    success: true,
    value: 2,
    description: "Curry 12' Jump Shot (2 PTS)",
    ...overrides,
  };
}

const CONTEXT: SubmissionContext = {
  homeTeamId: HOME_TEAM,
  awayTeamId: AWAY_TEAM,
  teamIdByPlayerId: new Map([
    [CURRY, HOME_TEAM],
    [GREEN, HOME_TEAM],
  ]),
};

describe("parseManualSubmissionBody", () => {
  it("parses a well-formed submission", () => {
    const result = parseManualSubmissionBody({
      events: [madeTwo()],
      minutesByPlayerId: { [CURRY]: 34 },
    });
    expect(result.events).toHaveLength(1);
    expect(result.minutesByPlayerId).toEqual({ [CURRY]: 34 });
  });

  it("rejects a missing or empty events array", () => {
    expect(() => parseManualSubmissionBody({ events: [], minutesByPlayerId: {} })).toThrow("non-empty array");
    expect(() => parseManualSubmissionBody({ minutesByPlayerId: {} })).toThrow("non-empty array");
  });

  it("rejects more events than the ceiling", () => {
    const events = Array.from({ length: MAX_EVENTS_PER_SUBMISSION + 1 }, (_, i) => madeTwo({ sequence: i + 1 }));
    expect(() => parseManualSubmissionBody({ events, minutesByPlayerId: {} })).toThrow("at most");
  });

  it("rejects a non-integer sequence", () => {
    expect(() =>
      parseManualSubmissionBody({ events: [madeTwo({ sequence: 1.5 })], minutesByPlayerId: {} })
    ).toThrow("events[0].sequence");
  });

  it("rejects a negative or fractional minutes value", () => {
    expect(() =>
      parseManualSubmissionBody({ events: [madeTwo()], minutesByPlayerId: { [CURRY]: -1 } })
    ).toThrow("non-negative integer");
    expect(() =>
      parseManualSubmissionBody({ events: [madeTwo()], minutesByPlayerId: { [CURRY]: 34.5 } })
    ).toThrow("non-negative integer");
  });
});

describe("validateSubmittedEvents", () => {
  it("accepts a clean, well-ordered batch", () => {
    const events = [madeTwo({ sequence: 1 }), madeTwo({ sequence: 2, description: "Green makes it" })];
    expect(validateSubmittedEvents(events, CONTEXT)).toEqual([]);
  });

  it("flags a sequence that repeats", () => {
    const events = [madeTwo({ sequence: 1 }), madeTwo({ sequence: 1 })];
    expect(validateSubmittedEvents(events, CONTEXT).join()).toContain("appears more than once");
  });

  it("flags a sequence that goes backwards or stays flat", () => {
    const events = [madeTwo({ sequence: 2 }), madeTwo({ sequence: 1 })];
    expect(validateSubmittedEvents(events, CONTEXT).join()).toContain("not strictly increasing");
  });

  it("flags an unknown event type", () => {
    const events = [madeTwo({ eventType: "slam dunk party" })];
    expect(validateSubmittedEvents(events, CONTEXT).join()).toContain("not in the platform vocabulary");
  });

  it("flags a player not on either team's roster", () => {
    const events = [madeTwo({ playerId: "stranger-id" })];
    expect(validateSubmittedEvents(events, CONTEXT).join()).toContain("not on either team's current roster");
  });

  it("flags a team that is neither team in the game", () => {
    const events = [madeTwo({ teamId: "some-other-team" })];
    expect(validateSubmittedEvents(events, CONTEXT).join()).toContain("neither team in this game");
  });

  it("flags a made/missed shot with no success flag", () => {
    const events = [madeTwo({ success: null })];
    expect(validateSubmittedEvents(events, CONTEXT).join()).toContain("must be marked made or missed");
  });

  it("flags success set on a play that isn't a shot", () => {
    const events = [madeTwo({ eventType: "rebound", success: true, value: 0 })];
    expect(validateSubmittedEvents(events, CONTEXT).join()).toContain("only applies to 2pt, 3pt and freethrow");
  });

  it("flags a value that doesn't fit the play", () => {
    const events = [madeTwo({ value: 3 })];
    expect(validateSubmittedEvents(events, CONTEXT).join()).toContain("doesn't fit this play");
  });

  it("flags an invalid rebound subType", () => {
    const events = [madeTwo({ eventType: "rebound", success: null, value: 0, subType: "sideways" })];
    expect(validateSubmittedEvents(events, CONTEXT).join()).toContain('subType must be "offensive", "defensive" or null');
  });

  it("flags an empty description", () => {
    const events = [madeTwo({ description: "   " })];
    expect(validateSubmittedEvents(events, CONTEXT).join()).toContain("description must not be empty");
  });
});
