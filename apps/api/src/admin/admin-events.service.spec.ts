import { describe, expect, it } from "vitest";
import { parseCorrectEventBody } from "./admin-events.service.js";

describe("parseCorrectEventBody", () => {
  it("throws when body is not an object", () => {
    expect(() => parseCorrectEventBody("string")).toThrow("must be an object");
    expect(() => parseCorrectEventBody(null)).toThrow("must be an object");
    expect(() => parseCorrectEventBody(undefined)).toThrow("must be an object");
    expect(() => parseCorrectEventBody(42)).toThrow("must be an object");
  });

  it("throws when no correctable fields are provided", () => {
    expect(() => parseCorrectEventBody({ reason: "oops" })).toThrow("At least one correctable field");
    expect(() => parseCorrectEventBody({})).toThrow("At least one correctable field");
  });

  it("accepts valid correctable fields", () => {
    const result = parseCorrectEventBody({ points: 3, description: "three pointer" });
    // points is not a correctable field, but description is.
    expect(result.description).toBe("three pointer");
  });

  it("accepts all correctable fields", () => {
    const body = {
      period: 2,
      clock: "5:30",
      eventType: "SHOT",
      subType: "3PT",
      playerId: "p1",
      teamId: "t1",
      success: true,
      value: 3,
      description: "three pointer made",
    };
    const result = parseCorrectEventBody(body);
    expect(result.period).toBe(2);
    expect(result.clock).toBe("5:30");
    expect(result.eventType).toBe("SHOT");
    expect(result.subType).toBe("3PT");
    expect(result.playerId).toBe("p1");
    expect(result.teamId).toBe("t1");
    expect(result.success).toBe(true);
    expect(result.value).toBe(3);
    expect(result.description).toBe("three pointer made");
  });

  it("ignores non-correctable fields", () => {
    const result = parseCorrectEventBody({ description: "fixed", gameId: "should-be-ignored" });
    expect(result.description).toBe("fixed");
    expect(result.gameId).toBeUndefined();
  });

  it("trims and validates reason when provided", () => {
    const result = parseCorrectEventBody({ description: "fix", reason: "  bad data  " });
    expect(result.reason).toBe("bad data");
  });

  it("throws when reason is an empty string", () => {
    expect(() => parseCorrectEventBody({ description: "fix", reason: "  " })).toThrow("non-empty string");
  });

  it("throws when reason is not a string", () => {
    expect(() => parseCorrectEventBody({ description: "fix", reason: 42 })).toThrow("non-empty string");
  });
});
