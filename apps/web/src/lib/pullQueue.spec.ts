import { describe, expect, it } from "vitest";
import { describeElapsed, describePullWindow, describeWorkerStatus, isActivePullRequest } from "./pullQueue";

const NOW = Date.parse("2026-09-18T15:00:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

describe("describeElapsed", () => {
  it.each([
    [0, "just now"],
    [1, "1 minute ago"],
    [45, "45 minutes ago"],
    [60, "1 hour ago"],
    [300, "5 hours ago"],
    [60 * 72, "3 days ago"],
  ])("%i minutes ago reads as %s", (minutes, expected) => {
    expect(describeElapsed(minutesAgo(minutes), NOW)).toBe(expected);
  });
});

describe("describeWorkerStatus", () => {
  it("says nothing will run when no worker has ever checked in", () => {
    const status = describeWorkerStatus(null, NOW);
    expect(status.isOnline).toBe(false);
    expect(status.text).toMatch(/No pull worker has checked in yet/);
  });

  it("treats a check-in within the last few minutes as online", () => {
    const status = describeWorkerStatus(minutesAgo(2), NOW);
    expect(status).toEqual({ isOnline: true, text: "Pull worker online — last checked in 2 minutes ago." });
  });

  it("warns once check-ins have stopped", () => {
    const status = describeWorkerStatus(minutesAgo(90), NOW);
    expect(status.isOnline).toBe(false);
    expect(status.text).toMatch(/2 hours ago and may be offline/);
  });
});

describe("describePullWindow", () => {
  it.each([
    [{ season: "2024-25", fromDate: "2026-04-14", toDate: "2026-04-18" }, "2024-25, 2026-04-14 to 2026-04-18"],
    [{ season: null, fromDate: "2026-04-14", toDate: null }, "Current season, from 2026-04-14"],
    [{ season: null, fromDate: null, toDate: "2026-04-18" }, "Current season, up to 2026-04-18"],
    [{ season: null, fromDate: null, toDate: null }, "Current season, recent games"],
  ])("%o reads as %s", (window, expected) => {
    expect(describePullWindow(window)).toBe(expected);
  });
});

describe("isActivePullRequest", () => {
  it("is true only while a request waits for or runs on a worker", () => {
    expect(isActivePullRequest("QUEUED")).toBe(true);
    expect(isActivePullRequest("RUNNING")).toBe(true);
    expect(isActivePullRequest("SUCCEEDED")).toBe(false);
    expect(isActivePullRequest("FAILED")).toBe(false);
    expect(isActivePullRequest("CANCELLED")).toBe(false);
  });
});
