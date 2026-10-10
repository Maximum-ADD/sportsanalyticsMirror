import { describe, expect, it, vi } from "vitest";
import { parseReviewBody } from "./admin-batches.controller.js";

// The controller's session guard imports auth.config, which builds a real
// PrismaClient at import time. Its native engine loads in the background,
// and if this short file ends first, Vitest tears down the worker mid-load
// and the engine aborts the whole run. Nothing here needs real auth.
vi.mock("../auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

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
