import { describe, expect, it } from "vitest";
import {
  describeFinish,
  describeGameTimes,
  describeLiveState,
  describePeriod,
  describeUpcomingState,
  formatCountdown,
  formatPlusMinus,
  formatShootingSplit,
  formatSouthAfricanTime,
  shouldRefreshOften,
} from "./liveGameDisplay";
import type { LiveGameSummary, LiveGamesBoard, UpcomingLiveGame } from "./liveGamesApi";

const REGULATION_PERIODS = 4;
// 21:00 SAST on Tuesday 6 October 2026.
const NOW_EPOCH_MILLISECONDS = Date.parse("2026-10-06T19:00:00Z");
const MINUTE_IN_MILLISECONDS = 60_000;

function minutesFromNow(minutes: number): string {
  return new Date(NOW_EPOCH_MILLISECONDS + minutes * MINUTE_IN_MILLISECONDS).toISOString();
}

function buildLiveState(gameClock: string | null, period = 3, statusText = "Q3 4:12") {
  return { period, regulationPeriods: REGULATION_PERIODS, gameClock, statusText };
}

function buildBoard(overrides: Partial<LiveGamesBoard> = {}): LiveGamesBoard {
  return { live: [], upcoming: [], recent: [], ...overrides };
}

function buildUpcoming(startsAt: string, statusNote: string | null = null): UpcomingLiveGame {
  return { startsAt, statusNote } as UpcomingLiveGame;
}

describe("describePeriod", () => {
  it.each([
    [1, "Q1"],
    [4, "Q4"],
    [5, "OT"],
    [6, "2OT"],
    [8, "4OT"],
  ])("names period %d %s", (period, expectedLabel) => {
    expect(describePeriod(period, REGULATION_PERIODS)).toBe(expectedLabel);
  });
});

describe("describeFinish", () => {
  it.each([
    [4, "Final"],
    [5, "Final/OT"],
    [6, "Final/2OT"],
  ])("says a game that ended in period %d finished %s", (period, expectedFinish) => {
    expect(describeFinish(period, REGULATION_PERIODS)).toBe(expectedFinish);
  });
});

describe("describeLiveState", () => {
  it("gives the quarter and time left", () => {
    expect(describeLiveState(buildLiveState("PT04M12.00S"))).toBe("Q3 · 4:12");
  });

  it("shows tenths in a period's last minute, and names overtime", () => {
    expect(describeLiveState(buildLiveState("PT00M38.10S", 4))).toBe("Q4 · 0:38.1");
    expect(describeLiveState(buildLiveState("PT02M31.00S", 5))).toBe("OT · 2:31");
  });

  it("falls back to the NBA's own status between periods", () => {
    expect(describeLiveState(buildLiveState(null, 2, "Half"))).toBe("Half");
    expect(describeLiveState(buildLiveState("PT00M00.00S", 3, "End of 3rd"))).toBe("End of 3rd");
  });

  it("falls back to the period when the NBA gives no status either", () => {
    expect(describeLiveState(buildLiveState(null, 2, ""))).toBe("Q2");
  });
});

describe("formatSouthAfricanTime", () => {
  it("shows only the time for a moment today in South Africa", () => {
    expect(formatSouthAfricanTime("2026-10-06T02:00:00Z", NOW_EPOCH_MILLISECONDS)).toBe("04:00");
  });

  it("adds the date for any other day, going by South Africa's date rather than UTC's", () => {
    // 22:05 UTC on the 6th is already 00:05 on the 7th in South Africa.
    expect(formatSouthAfricanTime("2026-10-06T22:05:00Z", NOW_EPOCH_MILLISECONDS)).toBe("Wed 7 Oct 00:05");
    expect(formatSouthAfricanTime("2026-10-05T21:30:00Z", NOW_EPOCH_MILLISECONDS)).toBe("Mon 5 Oct 23:30");
  });
});

describe("describeGameTimes", () => {
  it("gives a live game's start, and a finished game's start and end", () => {
    expect(describeGameTimes({ startsAt: "2026-10-06T02:00:00Z", endedAt: null }, NOW_EPOCH_MILLISECONDS)).toBe(
      "Start 04:00 SAST"
    );
    expect(
      describeGameTimes({ startsAt: "2026-10-05T21:30:00Z", endedAt: "2026-10-06T00:10:00Z" }, NOW_EPOCH_MILLISECONDS)
    ).toBe("Start Mon 5 Oct 23:30 · End 02:10 SAST");
  });
});

describe("formatCountdown", () => {
  it.each([
    [200, "in 3h 20m"],
    [240, "in 4h"],
    [45, "in 45m"],
    [0.5, "in 1m"],
  ])("counts down %d minutes as %s", (minutesToStart, expectedText) => {
    expect(formatCountdown(minutesFromNow(minutesToStart), NOW_EPOCH_MILLISECONDS)).toBe(expectedText);
  });

  it("stops once the start time has passed", () => {
    expect(formatCountdown(minutesFromNow(0), NOW_EPOCH_MILLISECONDS)).toBeNull();
    expect(formatCountdown(minutesFromNow(-5), NOW_EPOCH_MILLISECONDS)).toBeNull();
  });
});

describe("describeUpcomingState", () => {
  it("counts down to tip-off, then says the game is starting soon", () => {
    expect(describeUpcomingState(buildUpcoming(minutesFromNow(200)), NOW_EPOCH_MILLISECONDS)).toBe("in 3h 20m");
    expect(describeUpcomingState(buildUpcoming(minutesFromNow(-3)), NOW_EPOCH_MILLISECONDS)).toBe("Starting soon");
  });

  it("shows the NBA's note instead when the game is off track", () => {
    expect(describeUpcomingState(buildUpcoming(minutesFromNow(200), "PPD"), NOW_EPOCH_MILLISECONDS)).toBe("PPD");
  });
});

describe("box score formatting", () => {
  it("writes shooting as made-attempted and plus/minus with its sign", () => {
    expect(formatShootingSplit(4, 7)).toBe("4-7");
    expect([9, -6, 0].map(formatPlusMinus)).toEqual(["+9", "-6", "0"]);
  });
});

describe("shouldRefreshOften", () => {
  it("is true while a game is live", () => {
    expect(shouldRefreshOften(buildBoard({ live: [{ status: "live" } as LiveGameSummary] }), NOW_EPOCH_MILLISECONDS)).toBe(true);
  });

  it("is true while a game is past its start time and could tip off any moment", () => {
    const board = buildBoard({ upcoming: [buildUpcoming(minutesFromNow(-5))] });

    expect(shouldRefreshOften(board, NOW_EPOCH_MILLISECONDS)).toBe(true);
  });

  it("is false when the only late game is off track, everything is hours away, or nothing has loaded", () => {
    expect(shouldRefreshOften(buildBoard({ upcoming: [buildUpcoming(minutesFromNow(-5), "PPD")] }), NOW_EPOCH_MILLISECONDS)).toBe(false);
    expect(shouldRefreshOften(buildBoard({ upcoming: [buildUpcoming(minutesFromNow(90))] }), NOW_EPOCH_MILLISECONDS)).toBe(false);
    expect(shouldRefreshOften(undefined, NOW_EPOCH_MILLISECONDS)).toBe(false);
  });
});
