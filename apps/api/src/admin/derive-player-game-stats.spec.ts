import { describe, expect, it } from "vitest";
import {
  buildRosterNameIndex,
  deriveGameEventStats,
  resolveSecondaryPlayer,
  type DerivableGameEvent,
} from "./derive-player-game-stats.js";

// Mirrors apps/ingestion/test_derive_player_game_stats.py — same aggregation
// rules, ported from NBA personId to this project's own Player.id, and from
// each event's own playerName field to a lastName lookup (GameEvent doesn't
// persist playerName; see derive-player-game-stats.ts's module doc comment).
const CURRY = "curry-id";
const GREEN = "green-id";
const WEMBANYAMA = "wemby-id";
const GOBERT = "gobert-id";
const MORANT = "morant-id";
const HOLIDAY = "holiday-id";

const LAST_NAMES = new Map([
  [CURRY, "Curry"],
  [GREEN, "Green"],
  [WEMBANYAMA, "Wembanyama"],
  [GOBERT, "Gobert"],
  [MORANT, "Morant"],
  [HOLIDAY, "Holiday"],
]);

function madeShot(
  eventType: string,
  playerId: string,
  description: string,
  value: number,
): DerivableGameEvent {
  return { eventType, subType: null, playerId, success: true, value, description };
}

function missedShot(eventType: string, playerId: string, description: string): DerivableGameEvent {
  return {
    eventType,
    subType: null,
    playerId,
    success: false,
    value: eventType === "3pt" ? 3 : 2,
    description,
  };
}

// A neutral event (an unhandled eventType) whose only job is to put this
// player into the game's own roster-name index — see build_roster_name_
// index's Python docstring: a player must appear as an actor somewhere in
// the game's events to be resolvable as a secondary player at all.
function appearsInGame(playerId: string, name: string): DerivableGameEvent {
  return { eventType: "foul", subType: null, playerId, success: null, value: null, description: `${name} Personal Foul` };
}

describe("deriveGameEventStats", () => {
  it("credits both players on a made two-pointer with an assist", () => {
    const result = deriveGameEventStats(
      [madeShot("2pt", CURRY, "Curry 12' Jump Shot (2 PTS) (Green 5 AST)", 2), appearsInGame(GREEN, "Green")],
      LAST_NAMES,
    );

    expect(result.get(CURRY)?.points).toBe(2);
    expect(result.get(CURRY)?.fieldGoalsMade).toBe(1);
    expect(result.get(CURRY)?.fieldGoalsAttempted).toBe(1);
    expect(result.get(CURRY)?.threesMade).toBe(0);
    expect(result.get(GREEN)?.assists).toBe(1);
  });

  it("credits points and three-point splits on an assisted three", () => {
    const result = deriveGameEventStats(
      [
        madeShot("3pt", CURRY, "Curry 26' 3PT Jump Shot (31 PTS) (Green 7 AST)", 3),
        appearsInGame(GREEN, "Green"),
      ],
      LAST_NAMES,
    );

    expect(result.get(CURRY)?.points).toBe(3);
    expect(result.get(CURRY)?.fieldGoalsMade).toBe(1);
    expect(result.get(CURRY)?.threesMade).toBe(1);
    expect(result.get(CURRY)?.threesAttempted).toBe(1);
    expect(result.get(GREEN)?.assists).toBe(1);
  });

  it("credits no one an assist on an unassisted made shot", () => {
    const result = deriveGameEventStats([madeShot("2pt", CURRY, "Curry 12' Jump Shot (2 PTS)", 2)], LAST_NAMES);

    expect(result.get(CURRY)?.points).toBe(2);
    expect(result.has(GREEN)).toBe(false);
  });

  it("credits the blocker, not the shooter, on a blocked miss", () => {
    const result = deriveGameEventStats(
      [
        missedShot("2pt", CURRY, "MISS Curry 15' Jump Shot (Wembanyama 3 BLK)"),
        appearsInGame(WEMBANYAMA, "Wembanyama"),
      ],
      LAST_NAMES,
    );

    expect(result.get(CURRY)?.fieldGoalsMade).toBe(0);
    expect(result.get(CURRY)?.fieldGoalsAttempted).toBe(1);
    expect(result.get(CURRY)?.points).toBe(0);
    expect(result.get(WEMBANYAMA)?.blocks).toBe(1);
  });

  it("credits no one a block on an unblocked miss", () => {
    const result = deriveGameEventStats([missedShot("3pt", CURRY, "MISS Curry 26' 3PT Jump Shot")], LAST_NAMES);

    expect(result.get(CURRY)?.fieldGoalsAttempted).toBe(1);
    expect(result.get(CURRY)?.threesAttempted).toBe(1);
    expect(result.has(WEMBANYAMA)).toBe(false);
  });

  it("aggregates made and missed free throws", () => {
    const events: DerivableGameEvent[] = [
      { eventType: "freethrow", subType: null, playerId: CURRY, success: true, value: null, description: "Curry Free Throw 1 of 2 (10 PTS)" },
      { eventType: "freethrow", subType: null, playerId: CURRY, success: false, value: null, description: "MISS Curry Free Throw 2 of 2" },
    ];

    const result = deriveGameEventStats(events, LAST_NAMES);

    expect(result.get(CURRY)?.freeThrowsMade).toBe(1);
    expect(result.get(CURRY)?.freeThrowsAttempted).toBe(2);
    expect(result.get(CURRY)?.points).toBe(1);
  });

  it("splits and totals offensive and defensive rebounds", () => {
    const events: DerivableGameEvent[] = [
      { eventType: "rebound", subType: "offensive", playerId: CURRY, success: null, value: null, description: "Curry REBOUND (Off:1 Def:0)" },
      { eventType: "rebound", subType: "defensive", playerId: GOBERT, success: null, value: null, description: "Gobert REBOUND (Off:0 Def:5)" },
    ];

    const result = deriveGameEventStats(events, LAST_NAMES);

    expect(result.get(CURRY)?.offensiveRebounds).toBe(1);
    expect(result.get(CURRY)?.defensiveRebounds).toBe(0);
    expect(result.get(CURRY)?.rebounds).toBe(1);
    expect(result.get(GOBERT)?.defensiveRebounds).toBe(1);
    expect(result.get(GOBERT)?.rebounds).toBe(1);
  });

  it("excludes a team rebound from every player's totals", () => {
    const events: DerivableGameEvent[] = [
      { eventType: "rebound", subType: "defensive", playerId: null, success: null, value: null, description: "Warriors Rebound" },
    ];

    expect(deriveGameEventStats(events, LAST_NAMES).size).toBe(0);
  });

  it("credits both players on a turnover with a steal", () => {
    const events: DerivableGameEvent[] = [
      { eventType: "turnover", subType: null, playerId: MORANT, success: null, value: null, description: "Morant Bad Pass Turnover (P1.T3) (Holiday 3 STL)" },
      appearsInGame(HOLIDAY, "Holiday"),
    ];

    const result = deriveGameEventStats(events, LAST_NAMES);

    expect(result.get(MORANT)?.turnovers).toBe(1);
    expect(result.get(HOLIDAY)?.steals).toBe(1);
  });

  it("excludes a team turnover entirely", () => {
    const events: DerivableGameEvent[] = [
      { eventType: "turnover", subType: null, playerId: null, success: null, value: null, description: "Grizzlies Turnover: Shot Clock" },
    ];

    expect(deriveGameEventStats(events, LAST_NAMES).size).toBe(0);
  });

  it("credits no one a steal on a turnover with no steal", () => {
    const events: DerivableGameEvent[] = [
      { eventType: "turnover", subType: null, playerId: MORANT, success: null, value: null, description: "Morant Lost Ball Turnover" },
    ];

    const result = deriveGameEventStats(events, LAST_NAMES);

    expect(result.get(MORANT)?.turnovers).toBe(1);
    expect(result.get(MORANT)?.steals).toBe(0);
  });

  it("excludes a team-attributed free throw entirely", () => {
    const events: DerivableGameEvent[] = [
      { eventType: "freethrow", subType: null, playerId: null, success: true, value: null, description: "Team Free Throw" },
    ];

    expect(deriveGameEventStats(events, LAST_NAMES).size).toBe(0);
  });

  it("leaves a rebound with an unrecognised subType uncounted rather than guessing", () => {
    const events: DerivableGameEvent[] = [
      { eventType: "rebound", subType: "team", playerId: CURRY, success: null, value: null, description: "Curry REBOUND" },
    ];

    const result = deriveGameEventStats(events, LAST_NAMES);

    expect(result.get(CURRY)?.offensiveRebounds).toBe(0);
    expect(result.get(CURRY)?.defensiveRebounds).toBe(0);
    expect(result.get(CURRY)?.rebounds).toBe(0);
  });

  it("resolves an ambiguous surname to no one rather than guessing", () => {
    const williamsA = "williams-a";
    const williamsB = "williams-b";
    const names = new Map(LAST_NAMES).set(williamsA, "Williams").set(williamsB, "Williams");
    const events: DerivableGameEvent[] = [
      { eventType: "2pt", subType: null, playerId: williamsA, success: false, value: 2, description: "MISS Williams shot" },
      { eventType: "2pt", subType: null, playerId: williamsB, success: false, value: 2, description: "MISS Williams shot" },
      madeShot("2pt", CURRY, "Curry 12' Jump Shot (2 PTS) (Williams 4 AST)", 2),
    ];

    const result = deriveGameEventStats(events, names);

    expect(result.get(williamsA)?.assists).toBe(0);
    expect(result.get(williamsB)?.assists).toBe(0);
    expect(result.get(CURRY)?.points).toBe(2);
  });
});

describe("buildRosterNameIndex", () => {
  it("excludes team-attributed rows", () => {
    const events: DerivableGameEvent[] = [
      { eventType: "foul", subType: null, playerId: CURRY, success: null, value: null, description: "" },
      { eventType: "foul", subType: null, playerId: null, success: null, value: null, description: "" },
    ];

    expect(buildRosterNameIndex(events, LAST_NAMES)).toEqual(new Map([["Curry", [CURRY]]]));
  });

  it("excludes a player missing from the lastName lookup", () => {
    const unknownPlayerId = "unknown-id";
    const events: DerivableGameEvent[] = [
      { eventType: "foul", subType: null, playerId: unknownPlayerId, success: null, value: null, description: "" },
    ];

    expect(buildRosterNameIndex(events, LAST_NAMES).size).toBe(0);
  });
});

describe("deriveGameEventStats — team-attributed and default-value branches", () => {
  it("excludes a team-attributed made shot entirely", () => {
    const events: DerivableGameEvent[] = [
      { eventType: "2pt", subType: null, playerId: null, success: true, value: 2, description: "Team Putback" },
    ];

    expect(deriveGameEventStats(events, LAST_NAMES).size).toBe(0);
  });

  it("defaults a made shot's point value from its eventType when value is missing", () => {
    const events: DerivableGameEvent[] = [
      { eventType: "3pt", subType: null, playerId: CURRY, success: true, value: null, description: "Curry 26' 3PT Jump Shot" },
      { eventType: "2pt", subType: null, playerId: CURRY, success: true, value: null, description: "Curry 12' Jump Shot" },
    ];

    const result = deriveGameEventStats(events, LAST_NAMES);

    expect(result.get(CURRY)?.points).toBe(5);
  });
});

describe("resolveSecondaryPlayer", () => {
  it("returns null when the suffix is absent", () => {
    expect(resolveSecondaryPlayer("Curry 12' Jump Shot (2 PTS)", "assists", new Map([["Curry", [CURRY]]]))).toBeNull();
  });
});
