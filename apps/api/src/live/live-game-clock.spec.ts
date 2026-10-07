import { describe, expect, it } from "vitest";
import {
  computeElapsedGameSeconds,
  getPeriodLengthInSeconds,
  parseIsoDurationInSeconds,
  selectRecentPlays,
  type TimedPlay,
} from "./live-game-clock.js";

function buildPlay(period: number, clock: string, orderNumber = 0): TimedPlay {
  return { period, clock, orderNumber };
}

describe("parseIsoDurationInSeconds", () => {
  it.each([
    ["PT04M12.00S", 252],
    ["PT00M38.10S", 38.1],
    ["PT12M00.00S", 720],
    ["PT45S", 45],
    ["PT2M", 120],
  ])("reads %s as %d seconds", (duration, expectedSeconds) => {
    expect(parseIsoDurationInSeconds(duration)).toBeCloseTo(expectedSeconds);
  });

  // The feed sends "" between periods; the rest are other clock formats.
  it.each(["", "PT", "4:12", "P1D", "PT-1M04S"])("returns null for %j", (duration) => {
    expect(parseIsoDurationInSeconds(duration)).toBeNull();
  });
});

describe("getPeriodLengthInSeconds", () => {
  it("gives quarters twelve minutes and every overtime five", () => {
    expect([1, 4, 5, 7].map(getPeriodLengthInSeconds)).toEqual([720, 720, 300, 300]);
  });
});

describe("computeElapsedGameSeconds", () => {
  it.each([
    [1, 720, 0],
    [1, 0, 720],
    [3, 600, 1560],
    [4, 0, 2880],
    [5, 300, 2880],
    [6, 0, 3480],
  ])("puts period %d with %d seconds left at %d seconds played", (period, secondsLeft, expectedElapsedSeconds) => {
    expect(computeElapsedGameSeconds(period, secondsLeft)).toBe(expectedElapsedSeconds);
  });
});

describe("selectRecentPlays", () => {
  it("keeps the last five minutes of game time, latest first", () => {
    const sevenMinutesBack = buildPlay(4, "PT11M00.00S");
    const fourMinutesBack = buildPlay(4, "PT08M00.00S");
    const twoAndAHalfMinutesBack = buildPlay(4, "PT06M30.00S");
    const latest = buildPlay(4, "PT04M00.00S");

    const recentPlays = selectRecentPlays([sevenMinutesBack, fourMinutesBack, twoAndAHalfMinutesBack, latest]);

    expect(recentPlays).toEqual([latest, twoAndAHalfMinutesBack, fourMinutesBack]);
  });

  it("crosses a quarter break: two minutes into Q3 it holds the last three minutes of Q2", () => {
    const outsideWindow = buildPlay(2, "PT03M30.00S");
    const lastThreeMinutesOfQ2 = buildPlay(2, "PT02M59.00S");
    const endOfQ2 = buildPlay(2, "PT00M00.00S");
    const twoMinutesIntoQ3 = buildPlay(3, "PT10M00.00S");

    const recentPlays = selectRecentPlays([outsideWindow, lastThreeMinutesOfQ2, endOfQ2, twoMinutesIntoQ3]);

    expect(recentPlays).toEqual([twoMinutesIntoQ3, endOfQ2, lastThreeMinutesOfQ2]);
  });

  it("leaves out a play exactly five minutes back", () => {
    const fiveMinutesBack = buildPlay(1, "PT10M00.00S");
    const latest = buildPlay(1, "PT05M00.00S");

    expect(selectRecentPlays([fiveMinutesBack, latest])).toEqual([latest]);
  });

  it("orders plays logged at the same clock by the feed's order, reversed", () => {
    const foul = buildPlay(4, "PT00M14.10S", 507436264);
    const firstFreeThrow = buildPlay(4, "PT00M14.10S", 508836352);
    const secondFreeThrow = buildPlay(4, "PT00M14.10S", 509530151);

    expect(selectRecentPlays([firstFreeThrow, secondFreeThrow, foul])).toEqual([secondFreeThrow, firstFreeThrow, foul]);
  });

  // Were overtimes measured as 12 minutes, the late first-overtime play would
  // sit nine minutes back instead of two, and drop out.
  it("measures overtimes as five minutes when the window crosses from one into the next", () => {
    const earlyInFirstOvertime = buildPlay(5, "PT04M30.00S");
    const lateInFirstOvertime = buildPlay(5, "PT01M00.00S");
    const earlyInSecondOvertime = buildPlay(6, "PT04M00.00S");

    const recentPlays = selectRecentPlays([earlyInFirstOvertime, lateInFirstOvertime, earlyInSecondOvertime]);

    expect(recentPlays).toEqual([earlyInSecondOvertime, lateInFirstOvertime]);
  });

  it("leaves out plays whose clock can't be read, and copes with none at all", () => {
    const readablePlay = buildPlay(1, "PT11M00.00S");

    expect(selectRecentPlays([buildPlay(1, ""), readablePlay])).toEqual([readablePlay]);
    expect(selectRecentPlays([])).toEqual([]);
  });
});
