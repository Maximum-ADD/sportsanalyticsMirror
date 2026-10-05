import { describe, expect, it } from "vitest";
import { MINIMUM_GAMES_REQUIRED, describeValuationState } from "./valuation-state.js";

describe("describeValuationState", () => {
  it("names a valued season", () => {
    expect(describeValuationState({ gamesLogged: 14, hasValue: true })).toBe("VALUED");
  });

  it("names a season short of the games floor", () => {
    expect(describeValuationState({ gamesLogged: MINIMUM_GAMES_REQUIRED - 1, hasValue: false })).toBe(
      "BELOW_GAMES_FLOOR"
    );
  });

  // The whole reason this exists: thirty games logged and no value must read
  // as the system's gap, not the prospect's.
  it("distinguishes a missing model from missing games", () => {
    expect(describeValuationState({ gamesLogged: 30, hasValue: false })).toBe("AWAITING_MODEL");
  });

  // A stale figure left over from before games were deleted must not count.
  it("reports the floor even if an old value is somehow present", () => {
    expect(describeValuationState({ gamesLogged: 3, hasValue: true })).toBe("BELOW_GAMES_FLOOR");
  });
});
