import { describe, expect, it } from "vitest";
import { parseReviewBody } from "./admin-batches.controller.js";

describe("parseReviewBody", () => {
  it("returns empty object when body is not an object", () => {
    expect(parseReviewBody(null)).toEqual({});
    expect(parseReviewBody("str")).toEqual({});
    expect(parseReviewBody(42)).toEqual({});
  });

  it("returns trimmed reviewNotes when present as a non-empty string", () => {
    expect(parseReviewBody({ reviewNotes: "  looks good  " })).toEqual({ reviewNotes: "looks good" });
  });

  it("returns empty object when reviewNotes is missing", () => {
    expect(parseReviewBody({})).toEqual({});
  });

  it("returns empty object when reviewNotes is not a string", () => {
    expect(parseReviewBody({ reviewNotes: 42 })).toEqual({});
  });

  it("returns empty object when reviewNotes is an empty or whitespace-only string", () => {
    expect(parseReviewBody({ reviewNotes: "" })).toEqual({});
    expect(parseReviewBody({ reviewNotes: "   " })).toEqual({});
  });
});
