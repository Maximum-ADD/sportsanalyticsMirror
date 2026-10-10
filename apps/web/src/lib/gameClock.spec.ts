import { describe, expect, it } from "vitest";
import { formatGameClock, parseTypedGameClock } from "./gameClock";

describe("formatGameClock", () => {
  it("shows stored ISO clocks as m:ss", () => {
    expect(formatGameClock("PT11M30.00S")).toBe("11:30");
    expect(formatGameClock("PT00M00.00S")).toBe("0:00");
    expect(formatGameClock("PT00M04.50S")).toBe("0:04.5");
  });

  it("shows legacy clocks as they are, and unknown text untouched", () => {
    expect(formatGameClock("12:00")).toBe("12:00");
    expect(formatGameClock("0:00")).toBe("0:00");
    expect(formatGameClock("weird")).toBe("weird");
  });
});

describe("parseTypedGameClock", () => {
  it("converts a typed clock back to the stored ISO form", () => {
    expect(parseTypedGameClock("11:30")).toBe("PT11M30.00S");
    expect(parseTypedGameClock(" 0:04.5 ")).toBe("PT00M04.50S");
    expect(parseTypedGameClock("12:00")).toBe("PT12M00.00S");
  });

  it("round-trips what formatGameClock shows", () => {
    for (const stored of ["PT11M30.00S", "PT00M04.50S", "PT05M07.00S"]) {
      expect(parseTypedGameClock(formatGameClock(stored))).toBe(stored);
    }
  });

  it("rejects malformed times and anything past 12:00", () => {
    expect(parseTypedGameClock("11:3")).toBeNull();
    expect(parseTypedGameClock("11:60")).toBeNull();
    expect(parseTypedGameClock("12:01")).toBeNull();
    expect(parseTypedGameClock("13:00")).toBeNull();
    expect(parseTypedGameClock("soon")).toBeNull();
  });
});
