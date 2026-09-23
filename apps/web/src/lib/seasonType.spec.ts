import { describe, expect, it } from "vitest";
import {
  ALL_SEGMENTS,
  SEASON_TYPES_IN_ORDER,
  isSmallSample,
  parseUrlSegment,
  parseUrlSegmentSelection,
  toSeasonTypeParam,
  toUrlSegment,
  toUrlSegmentSelection,
} from "./seasonType";

describe("season segment URL parameters", () => {
  it("round-trips every segment through the URL", () => {
    for (const seasonType of SEASON_TYPES_IN_ORDER) {
      expect(parseUrlSegment(toUrlSegment(seasonType))).toBe(seasonType);
    }
  });

  it("uses readable, shareable URL values rather than the API's enum spelling", () => {
    expect(toUrlSegment("PLAY_IN")).toBe("play-in");
    expect(toUrlSegment("REGULAR")).toBe("regular");
  });

  it("falls back to the regular season for a missing or unrecognised segment", () => {
    // A stale or hand-edited link should land somewhere sensible rather
    // than blanking the page. Safe here because this only picks which of
    // four valid requests to make — the request still names an exact
    // segment, and the API itself rejects an unknown one with a 400.
    expect(parseUrlSegment(null)).toBe("REGULAR");
    expect(parseUrlSegment("")).toBe("REGULAR");
    expect(parseUrlSegment("playoff")).toBe("REGULAR");
    expect(parseUrlSegment("PLAYOFFS")).toBe("REGULAR");
  });
});

describe("season segment selections that allow every segment", () => {
  it("treats a missing segment as every segment, matching the games endpoint's own default", () => {
    expect(parseUrlSegmentSelection(null)).toBe(ALL_SEGMENTS);
    expect(parseUrlSegmentSelection("all")).toBe(ALL_SEGMENTS);
  });

  it("round-trips a real segment and the all-segments selection", () => {
    expect(parseUrlSegmentSelection(toUrlSegmentSelection("FINALS"))).toBe("FINALS");
    expect(parseUrlSegmentSelection(toUrlSegmentSelection(ALL_SEGMENTS))).toBe(ALL_SEGMENTS);
  });

  it("sends no seasonType for the all-segments selection", () => {
    // Absent, not "ALL" — the API has no such value, and an absent
    // seasonType is what it reads as "every segment".
    expect(toSeasonTypeParam(ALL_SEGMENTS)).toBeUndefined();
    expect(toSeasonTypeParam("PLAYOFFS")).toBe("PLAYOFFS");
  });
});

describe("isSmallSample", () => {
  it("flags a short postseason series but not a full season", () => {
    expect(isSmallSample(2)).toBe(true);
    expect(isSmallSample(3)).toBe(true);
    expect(isSmallSample(4)).toBe(false);
    expect(isSmallSample(70)).toBe(false);
  });

  it("does not flag a segment with no games, which is absence rather than a small sample", () => {
    expect(isSmallSample(0)).toBe(false);
  });
});
