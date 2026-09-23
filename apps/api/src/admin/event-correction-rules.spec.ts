import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGameRoster, resolveSecondaryPlayer, type PlayerName } from "./derive-player-game-stats.js";
import {
  creditStatFor,
  hasInapplicableCreditSuffix,
  KNOWN_EVENT_TYPES,
  parseClockInSeconds,
  rewriteCreditSuffix,
  stripCreditSuffixes,
  validateCorrectedEvent,
  type CorrectableEvent,
  type CorrectionContext,
} from "./event-correction-rules.js";

const HOME = "team-home";
const AWAY = "team-away";

function makeEvent(overrides: Partial<CorrectableEvent> = {}): CorrectableEvent {
  return {
    period: 1,
    clock: "PT11M30.00S",
    eventType: "2pt",
    subType: "Jump Shot",
    playerId: "curry",
    teamId: HOME,
    success: true,
    value: 2,
    description: "Curry 12' Jump Shot (2 PTS)",
    ...overrides,
  };
}

function makeContext(overrides: Partial<CorrectionContext> = {}): CorrectionContext {
  return {
    homeTeamId: HOME,
    awayTeamId: AWAY,
    teamIdByRosterPlayerId: new Map([
      ["curry", HOME],
      ["green", HOME],
      ["james", AWAY],
    ]),
    originalPlayerId: "curry",
    ...overrides,
  };
}

describe("KNOWN_EVENT_TYPES", () => {
  // A correction must accept exactly the types ingestion accepts, or an
  // admin could save a play the pipeline would reject (or be unable to
  // save one it accepted).
  it("matches KNOWN_ACTION_TYPES in apps/ingestion/event_validation.py", () => {
    const pythonSource = readFileSync(new URL("../../../ingestion/event_validation.py", import.meta.url), "utf-8");
    const setBody = /KNOWN_ACTION_TYPES = \{([^}]*)\}/.exec(pythonSource)?.[1] ?? "";
    const pythonTypes = [...setBody.matchAll(/^\s*"([^"]+)",/gm)].map((match) => match[1]);

    expect(pythonTypes.length).toBeGreaterThan(0);
    expect([...KNOWN_EVENT_TYPES].sort()).toEqual(pythonTypes.sort());
  });
});

describe("parseClockInSeconds", () => {
  it("reads the stored ISO form and the legacy mm:ss form", () => {
    expect(parseClockInSeconds("PT11M30.00S")).toBe(690);
    expect(parseClockInSeconds("PT00M04.50S")).toBe(4.5);
    expect(parseClockInSeconds("11:30")).toBe(690);
    expect(parseClockInSeconds("0:00")).toBe(0);
  });

  it("rejects malformed and out-of-range clocks", () => {
    expect(parseClockInSeconds("PT13M00.00S")).toBeNull();
    expect(parseClockInSeconds("PT11M75.00S")).toBeNull();
    expect(parseClockInSeconds("11:3")).toBeNull();
    expect(parseClockInSeconds("half past")).toBeNull();
  });
});

describe("validateCorrectedEvent", () => {
  it("accepts real ingested shapes: shots, free throws at value 0, team plays and bare markers", () => {
    const context = makeContext();
    expect(validateCorrectedEvent(makeEvent(), context)).toEqual([]);
    expect(validateCorrectedEvent(makeEvent({ success: false }), context)).toEqual([]);
    expect(validateCorrectedEvent(makeEvent({ eventType: "freethrow", value: 0 }), context)).toEqual([]);
    expect(
      validateCorrectedEvent(makeEvent({ eventType: "rebound", subType: null, playerId: null, success: null, value: 0 }), context),
    ).toEqual([]);
    expect(
      validateCorrectedEvent(
        makeEvent({ eventType: "heave", playerId: null, teamId: null, success: null, value: 0 }),
        makeContext({ originalPlayerId: null }),
      ),
    ).toEqual([]);
    expect(
      validateCorrectedEvent(
        makeEvent({ eventType: "period", subType: "start", playerId: null, teamId: null, success: null, value: 0, clock: "12:00" }),
        context,
      ),
    ).toEqual([]);
  });

  it("rejects an event type outside the platform vocabulary", () => {
    expect(validateCorrectedEvent(makeEvent({ eventType: "slam" }), makeContext())[0]).toMatch(/not in the platform vocabulary/);
  });

  it("rejects a period outside 1-10 and a malformed clock", () => {
    expect(validateCorrectedEvent(makeEvent({ period: 11 }), makeContext())[0]).toMatch(/period must be an integer from 1 to 10/);
    expect(validateCorrectedEvent(makeEvent({ clock: "soon" }), makeContext())[0]).toMatch(/not a valid game clock/);
  });

  it("rejects a new player without a box-score row, but not the unchanged original player", () => {
    const context = makeContext({ originalPlayerId: "benched" });
    expect(validateCorrectedEvent(makeEvent({ playerId: "stranger" }), context)[0]).toMatch(/did not play in this game/);
    expect(validateCorrectedEvent(makeEvent({ playerId: "benched", eventType: "foul", success: null, value: 0 }), context)).toEqual([]);
  });

  it("rejects a team outside the game, and a team that isn't the player's", () => {
    expect(validateCorrectedEvent(makeEvent({ teamId: "team-other" }), makeContext())[0]).toMatch(/neither team in this game/);
    expect(validateCorrectedEvent(makeEvent({ teamId: AWAY }), makeContext())[0]).toMatch(/does not match the team the player played for/);
    expect(validateCorrectedEvent(makeEvent({ teamId: null }), makeContext())[0]).toMatch(/must also have that player's team/);
  });

  it("skips the team match when nothing records the player's team", () => {
    const context = makeContext({ teamIdByRosterPlayerId: new Map([["curry", null]]) });
    expect(validateCorrectedEvent(makeEvent({ teamId: AWAY }), context)).toEqual([]);
  });

  it("requires made/missed on shots and forbids it elsewhere", () => {
    expect(validateCorrectedEvent(makeEvent({ success: null }), makeContext())[0]).toMatch(/must be marked made or missed/);
    expect(
      validateCorrectedEvent(makeEvent({ eventType: "rebound", subType: "defensive", value: 0 }), makeContext())[0],
    ).toMatch(/success only applies to 2pt, 3pt and freethrow/);
  });

  it("rejects a value that doesn't fit the play", () => {
    expect(validateCorrectedEvent(makeEvent({ value: 5 }), makeContext())[0]).toMatch(/value 5 doesn't fit a made 2pt/);
    expect(validateCorrectedEvent(makeEvent({ eventType: "3pt", value: 2 }), makeContext())[0]).toMatch(/value 2 doesn't fit a made 3pt/);
    expect(validateCorrectedEvent(makeEvent({ eventType: "freethrow", success: false, value: 1 }), makeContext())[0]).toMatch(
      /doesn't fit a missed freethrow/,
    );
    expect(validateCorrectedEvent(makeEvent({ eventType: "freethrow", value: 1 }), makeContext())).toEqual([]);
    expect(validateCorrectedEvent(makeEvent({ value: null }), makeContext())).toEqual([]);
  });

  it("only allows offensive/defensive (or null) as a rebound's subType", () => {
    const rebound = makeEvent({ eventType: "rebound", success: null, value: 0 });
    expect(validateCorrectedEvent({ ...rebound, subType: "offensive" }, makeContext())).toEqual([]);
    expect(validateCorrectedEvent({ ...rebound, subType: "Jump Shot" }, makeContext())[0]).toMatch(/rebound's subType/);
  });

  it("reports every broken rule at once", () => {
    expect(validateCorrectedEvent(makeEvent({ period: 0, value: 9, description: " " }), makeContext())).toHaveLength(3);
  });
});

describe("credit suffixes", () => {
  it("names the credit each play can take", () => {
    expect(creditStatFor({ eventType: "3pt", success: true })).toBe("assists");
    expect(creditStatFor({ eventType: "2pt", success: false })).toBe("blocks");
    expect(creditStatFor({ eventType: "turnover", success: null })).toBe("steals");
    expect(creditStatFor({ eventType: "freethrow", success: true })).toBeNull();
    expect(creditStatFor({ eventType: "rebound", success: null })).toBeNull();
  });

  it("strips every credit suffix and spots ones a play can't take", () => {
    expect(stripCreditSuffixes("Ryan 26' 3PT Jump Shot (24 PTS) (Green 4 AST)")).toBe("Ryan 26' 3PT Jump Shot (24 PTS)");
    expect(stripCreditSuffixes("Collins Bad Pass Turnover (P2.T2) (Jal. Williams 1 STL)")).toBe("Collins Bad Pass Turnover (P2.T2)");
    expect(hasInapplicableCreditSuffix("MISS Curry Jump Shot (Green 1 AST)", "blocks")).toBe(true);
    expect(hasInapplicableCreditSuffix("MISS Curry Jump Shot (James 1 BLK)", "blocks")).toBe(false);
    expect(hasInapplicableCreditSuffix("Curry Personal Foul (Green 1 AST)", null)).toBe(true);
  });
});

describe("rewriteCreditSuffix", () => {
  const names = new Map<string, PlayerName>([
    ["curry", { firstName: "Stephen", lastName: "Curry" }],
    ["green", { firstName: "Draymond", lastName: "Green" }],
    ["james", { firstName: "LeBron", lastName: "James" }],
    ["bronny", { firstName: "Bronny", lastName: "James" }],
    ["jalen", { firstName: "Jalen", lastName: "Williams" }],
    ["jaylin", { firstName: "Jaylin", lastName: "Williams" }],
  ]);
  // Everyone acts once, on the side given.
  const roster = buildGameRoster(
    [
      ["curry", HOME],
      ["green", HOME],
      ["james", AWAY],
      ["bronny", AWAY],
      ["jalen", HOME],
      ["jaylin", HOME],
    ].map(([playerId, teamId]) => ({
      eventType: "foul",
      subType: null,
      playerId,
      teamId,
      success: null,
      value: 0,
      description: "",
    })),
    names,
  );
  const madeShot = makeEvent({ description: "Curry 12' Jump Shot (2 PTS) (Jalen 1 AST)" });

  function rewrite(event: CorrectableEvent, stat: "assists" | "blocks" | "steals", playerId: string, earlierCreditCount = 0) {
    return rewriteCreditSuffix({
      event,
      stat,
      creditedPlayer: { playerId, name: names.get(playerId)! },
      roster,
      earlierCreditCount,
    });
  }

  it("replaces the existing credit with a bare surname that resolves to the chosen player", () => {
    const result = rewrite(madeShot, "assists", "green", 3);
    expect(result).toEqual({ description: "Curry 12' Jump Shot (2 PTS) (Green 4 AST)" });
    expect(resolveSecondaryPlayer((result as { description: string }).description, "assists", roster, HOME)).toBe("green");
  });

  it("falls back to an initial when the surname alone is ambiguous on that side", () => {
    const missedShot = makeEvent({ success: false, description: "MISS Curry 12' Jump Shot" });
    expect(rewrite(missedShot, "blocks", "james")).toEqual({ description: "MISS Curry 12' Jump Shot (L. James 1 BLK)" });
  });

  it("rejects a name the derivation can't tell apart from a teammate's", () => {
    expect(rewrite(madeShot, "assists", "jalen")).toEqual({ error: expect.stringMatching(/matches another player/) });
  });

  it("enforces the side a credit comes from", () => {
    expect(rewrite(madeShot, "assists", "james")).toEqual({ error: expect.stringMatching(/shooter's team/) });
    const turnover = makeEvent({ eventType: "turnover", success: null, value: 0, description: "Curry Bad Pass Turnover" });
    expect(rewrite(turnover, "steals", "green")).toEqual({ error: expect.stringMatching(/must come from the other team/) });
    expect(rewrite(turnover, "steals", "james")).toEqual({ description: "Curry Bad Pass Turnover (L. James 1 STL)" });
  });

  it("rejects crediting the play's own player, and a player with no play in the game", () => {
    expect(rewrite(madeShot, "assists", "curry")).toEqual({ error: expect.stringMatching(/own play/) });
    const result = rewriteCreditSuffix({
      event: madeShot,
      stat: "assists",
      creditedPlayer: { playerId: "ghost", name: { firstName: "Casper", lastName: "Ghost" } },
      roster,
      earlierCreditCount: 0,
    });
    expect(result).toEqual({ error: expect.stringMatching(/no play of their own/) });
  });
});
