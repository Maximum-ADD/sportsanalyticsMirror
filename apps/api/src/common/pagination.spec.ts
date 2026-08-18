import { describe, expect, it } from "vitest";
import { parsePageParams } from "./pagination.js";

describe("parsePageParams", () => {
  it("defaults to page 1 and pageSize 25 when the query is empty", () => {
    expect(parsePageParams({})).toEqual({ page: 1, pageSize: 25 });
  });

  it("parses numeric strings from the query object", () => {
    expect(parsePageParams({ page: "3", pageSize: "10" })).toEqual({ page: 3, pageSize: 10 });
  });

  it("floors page at 1 for zero, negative, or non-numeric values", () => {
    expect(parsePageParams({ page: "0" }).page).toBe(1);
    expect(parsePageParams({ page: "-5" }).page).toBe(1);
    expect(parsePageParams({ page: "not-a-number" }).page).toBe(1);
  });

  it("clamps a negative pageSize up to 1", () => {
    expect(parsePageParams({ pageSize: "-10" }).pageSize).toBe(1);
  });

  it("clamps an over-large pageSize down to 100", () => {
    expect(parsePageParams({ pageSize: "500" }).pageSize).toBe(100);
    expect(parsePageParams({ pageSize: "100" }).pageSize).toBe(100);
  });

  it("treats pageSize=0 as falsy and falls back to the default (25), same as an unset pageSize", () => {
    // `Number(query.pageSize) || DEFAULT_PAGE_SIZE` in parsePageParams treats
    // 0 as falsy, so it hits the default branch rather than being clamped to 1.
    expect(parsePageParams({ pageSize: "0" }).pageSize).toBe(25);
  });

  it("ignores non-numeric pageSize and falls back to the default", () => {
    expect(parsePageParams({ pageSize: "abc" }).pageSize).toBe(25);
  });
});
