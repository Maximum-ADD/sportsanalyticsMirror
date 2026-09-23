import { describe, expect, it } from "vitest";
import { MAX_REASON_LENGTH, parseCorrectEventBody, parseRevertBody } from "./event-correction-request.js";

describe("parseCorrectEventBody", () => {
  it("throws when body is not an object", () => {
    expect(() => parseCorrectEventBody("string")).toThrow("must be an object");
    expect(() => parseCorrectEventBody(null)).toThrow("must be an object");
    expect(() => parseCorrectEventBody(undefined)).toThrow("must be an object");
    expect(() => parseCorrectEventBody(42)).toThrow("must be an object");
    expect(() => parseCorrectEventBody([])).toThrow("must be an object");
  });

  it("throws when no correctable fields are provided", () => {
    expect(() => parseCorrectEventBody({ reason: "oops" })).toThrow("At least one correctable field");
    expect(() => parseCorrectEventBody({})).toThrow("At least one correctable field");
  });

  it("accepts a credit choice on its own", () => {
    expect(parseCorrectEventBody({ creditPlayerId: null, reason: "no assist" })).toEqual({
      patch: {},
      creditPlayerId: null,
      reason: "no assist",
    });
  });

  it("accepts all correctable fields", () => {
    const body = {
      period: 2,
      clock: "PT05M30.00S",
      eventType: "3pt",
      subType: "Jump Shot",
      playerId: "p1",
      teamId: "t1",
      success: true,
      value: 3,
      description: "three pointer made",
      reason: "wrong shot",
    };
    const { reason, ...fields } = body;
    expect(parseCorrectEventBody(body)).toEqual({ patch: fields, reason });
  });

  it("ignores non-correctable fields", () => {
    const result = parseCorrectEventBody({ description: "fixed", gameId: "should-be-ignored", reason: "typo" });
    expect(result.patch).toEqual({ description: "fixed" });
  });

  it("rejects a field of the wrong type", () => {
    expect(() => parseCorrectEventBody({ period: 1.5, reason: "r" })).toThrow("period must be an integer");
    expect(() => parseCorrectEventBody({ period: "2", reason: "r" })).toThrow("period must be an integer");
    expect(() => parseCorrectEventBody({ success: "yes", reason: "r" })).toThrow("success must be true, false or null");
    expect(() => parseCorrectEventBody({ playerId: 7, reason: "r" })).toThrow("playerId must be a string or null");
    expect(() => parseCorrectEventBody({ clock: null, reason: "r" })).toThrow("clock must be a string");
    expect(() => parseCorrectEventBody({ creditPlayerId: 3, reason: "r" })).toThrow("creditPlayerId must be a string or null");
  });

  it("trims the reason", () => {
    expect(parseCorrectEventBody({ description: "fix", reason: "  bad data  " }).reason).toBe("bad data");
  });

  it("requires a non-blank string reason", () => {
    expect(() => parseCorrectEventBody({ description: "fix" })).toThrow("reason is required");
    expect(() => parseCorrectEventBody({ description: "fix", reason: "  " })).toThrow("reason is required");
    expect(() => parseCorrectEventBody({ description: "fix", reason: 42 })).toThrow("reason is required");
  });

  it("caps the reason's length", () => {
    expect(() => parseCorrectEventBody({ description: "fix", reason: "x".repeat(MAX_REASON_LENGTH + 1) })).toThrow(
      `at most ${MAX_REASON_LENGTH} characters`,
    );
  });
});

describe("parseRevertBody", () => {
  it("requires a reason", () => {
    expect(parseRevertBody({ reason: " mistake " })).toEqual({ reason: "mistake" });
    expect(() => parseRevertBody({})).toThrow("reason is required");
    expect(() => parseRevertBody(undefined)).toThrow("reason is required");
  });
});
