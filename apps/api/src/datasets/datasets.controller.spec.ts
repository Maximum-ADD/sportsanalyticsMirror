import { describe, expect, it } from "vitest";
import { parsePublishBody } from "./datasets.controller.js";

describe("parsePublishBody", () => {
  it("throws when body is not an object", () => {
    expect(() => parsePublishBody(null)).toThrow("must be an object");
    expect(() => parsePublishBody("str")).toThrow("must be an object");
    expect(() => parsePublishBody(42)).toThrow("must be an object");
  });

  it("throws when version is missing or empty", () => {
    expect(() => parsePublishBody({ description: "d", season: "s" })).toThrow("version is required");
    expect(() => parsePublishBody({ version: "", description: "d", season: "s" })).toThrow("version is required");
    expect(() => parsePublishBody({ version: "   ", description: "d", season: "s" })).toThrow("version is required");
    expect(() => parsePublishBody({ version: 42, description: "d", season: "s" })).toThrow("version is required");
  });

  it("throws when description is missing or empty", () => {
    expect(() => parsePublishBody({ version: "v", season: "s" })).toThrow("description is required");
    expect(() => parsePublishBody({ version: "v", description: "", season: "s" })).toThrow("description is required");
    expect(() => parsePublishBody({ version: "v", description: 42, season: "s" })).toThrow("description is required");
  });

  it("throws when season is missing or empty", () => {
    expect(() => parsePublishBody({ version: "v", description: "d" })).toThrow("season is required");
    expect(() => parsePublishBody({ version: "v", description: "d", season: "" })).toThrow("season is required");
    expect(() => parsePublishBody({ version: "v", description: "d", season: 42 })).toThrow("season is required");
  });

  it("returns trimmed fields when all are valid", () => {
    const result = parsePublishBody({ version: "  1.0  ", description: "  Initial  ", season: "  2025-26  " });
    expect(result).toEqual({ version: "1.0", description: "Initial", season: "2025-26" });
  });
});
