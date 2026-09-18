import { describe, expect, it } from "vitest";
import {
  buildGameRoster,
  creditNameMatches,
  deriveGameEventStats,
  foldName,
  resolveSecondaryPlayer,
  type DerivableGameEvent,
  type PlayerName,
} from "./derive-player-game-stats.js";

// Mirrors apps/ingestion/test_derive_player_game_stats.py — same aggregation
// rules, ported from NBA personId to this project's own Player.id, and from
// each event's own playerName field to a Player name lookup (GameEvent
// doesn't persist playerName; see derive-player-game-stats.ts's module doc).
const WARRIORS = "warriors-id";
const SPURS = "spurs-id";

const CURRY = "curry-id";
const GREEN = "green-id";
const WEMBANYAMA = "wemby-id";
const GOBERT = "gobert-id";
const MORANT = "morant-id";
const HOLIDAY = "holiday-id";

const NAMES = new Map<string, PlayerName>([
  [CURRY, { firstName: "Stephen", lastName: "Curry" }],
  [GREEN, { firstName: "Draymond", lastName: "Green" }],
  [WEMBANYAMA, { firstName: "Victor", lastName: "Wembanyama" }],
  [GOBERT, { firstName: "Rudy", lastName: "Gobert" }],
  [MORANT, { firstName: "Ja", lastName: "Morant" }],
  [HOLIDAY, { firstName: "Jrue", lastName: "Holiday" }],
]);

function event(overrides: Partial<DerivableGameEvent>): DerivableGameEvent {
  return {
    eventType: "foul",
    subType: null,
    playerId: null,
    teamId: WARRIORS,
    success: null,
    value: null,
    description: "",
    ...overrides,
  };
}

function madeShot(eventType: string, playerId: string, description: string, value: number, teamId = WARRIORS) {
  return event({ eventType, playerId, teamId, success: true, value, description });
}

function missedShot(eventType: string, playerId: string, description: string, teamId = WARRIORS) {
  return event({ eventType, playerId, teamId, success: false, value: eventType === "3pt" ? 3 : 2, description });
}

// A neutral event whose only job is to put this player on the game's roster
// for name resolution — a player must act somewhere in the game's own
// events to be resolvable as a credited player at all.
function appearsInGame(playerId: string, teamId = WARRIORS): DerivableGameEvent {
  return event({ playerId, teamId, description: "Personal Foul" });
}

describe("deriveGameEventStats", () => {
  it("credits both players on a made two-pointer with an assist", () => {
    const result = deriveGameEventStats(
      [madeShot("2pt", CURRY, "Curry 12' Jump Shot (2 PTS) (Green 5 AST)", 2), appearsInGame(GREEN)],
      NAMES,
    );

    expect(result.get(CURRY)?.points).toBe(2);
    expect(result.get(CURRY)?.fieldGoalsMade).toBe(1);
    expect(result.get(CURRY)?.fieldGoalsAttempted).toBe(1);
    expect(result.get(CURRY)?.threesMade).toBe(0);
    expect(result.get(GREEN)?.assists).toBe(1);
  });

  it("credits points and three-point splits on an assisted three", () => {
    const result = deriveGameEventStats(
      [madeShot("3pt", CURRY, "Curry 26' 3PT Jump Shot (31 PTS) (Green 7 AST)", 3), appearsInGame(GREEN)],
      NAMES,
    );

    expect(result.get(CURRY)?.points).toBe(3);
    expect(result.get(CURRY)?.threesMade).toBe(1);
    expect(result.get(CURRY)?.threesAttempted).toBe(1);
    expect(result.get(GREEN)?.assists).toBe(1);
  });

  it("credits no one an assist on an unassisted made shot", () => {
    const result = deriveGameEventStats([madeShot("2pt", CURRY, "Curry 12' Jump Shot (2 PTS)", 2)], NAMES);

    expect(result.get(CURRY)?.points).toBe(2);
    expect(result.has(GREEN)).toBe(false);
  });

  it("credits the blocker, not the shooter, on a blocked miss", () => {
    const result = deriveGameEventStats(
      [
        missedShot("2pt", CURRY, "MISS Curry 15' Jump Shot (Wembanyama 3 BLK)"),
        appearsInGame(WEMBANYAMA, SPURS),
      ],
      NAMES,
    );

    expect(result.get(CURRY)?.fieldGoalsAttempted).toBe(1);
    expect(result.get(CURRY)?.points).toBe(0);
    expect(result.get(WEMBANYAMA)?.blocks).toBe(1);
  });

  it("credits no one a block on an unblocked miss", () => {
    const result = deriveGameEventStats([missedShot("3pt", CURRY, "MISS Curry 26' 3PT Jump Shot")], NAMES);

    expect(result.get(CURRY)?.threesAttempted).toBe(1);
    expect(result.has(WEMBANYAMA)).toBe(false);
  });

  it("aggregates made and missed free throws", () => {
    const events = [
      event({ eventType: "freethrow", playerId: CURRY, success: true, description: "Curry Free Throw 1 of 2 (10 PTS)" }),
      event({ eventType: "freethrow", playerId: CURRY, success: false, description: "MISS Curry Free Throw 2 of 2" }),
    ];

    const result = deriveGameEventStats(events, NAMES);

    expect(result.get(CURRY)?.freeThrowsMade).toBe(1);
    expect(result.get(CURRY)?.freeThrowsAttempted).toBe(2);
    expect(result.get(CURRY)?.points).toBe(1);
  });

  it("splits and totals offensive and defensive rebounds", () => {
    const events = [
      event({ eventType: "rebound", subType: "offensive", playerId: CURRY, description: "Curry REBOUND (Off:1 Def:0)" }),
      event({ eventType: "rebound", subType: "defensive", playerId: GOBERT, description: "Gobert REBOUND (Off:0 Def:5)" }),
    ];

    const result = deriveGameEventStats(events, NAMES);

    expect(result.get(CURRY)?.offensiveRebounds).toBe(1);
    expect(result.get(CURRY)?.rebounds).toBe(1);
    expect(result.get(GOBERT)?.defensiveRebounds).toBe(1);
    expect(result.get(GOBERT)?.rebounds).toBe(1);
  });

  it("excludes team-attributed rows from every player's totals", () => {
    const events = [
      event({ eventType: "rebound", subType: "defensive", description: "Warriors Rebound" }),
      event({ eventType: "turnover", description: "Grizzlies Turnover: Shot Clock" }),
      event({ eventType: "freethrow", success: true, description: "Team Free Throw" }),
      event({ eventType: "2pt", success: true, value: 2, description: "Team Putback" }),
    ];

    expect(deriveGameEventStats(events, NAMES).size).toBe(0);
  });

  it("credits both players on a turnover with a steal", () => {
    const events = [
      event({ eventType: "turnover", playerId: MORANT, teamId: SPURS, description: "Morant Bad Pass Turnover (P1.T3) (Holiday 3 STL)" }),
      appearsInGame(HOLIDAY, WARRIORS),
    ];

    const result = deriveGameEventStats(events, NAMES);

    expect(result.get(MORANT)?.turnovers).toBe(1);
    expect(result.get(HOLIDAY)?.steals).toBe(1);
  });

  it("credits no one a steal on a turnover with no steal", () => {
    const result = deriveGameEventStats(
      [event({ eventType: "turnover", playerId: MORANT, description: "Morant Lost Ball Turnover" })],
      NAMES,
    );

    expect(result.get(MORANT)?.turnovers).toBe(1);
    expect(result.get(MORANT)?.steals).toBe(0);
  });

  it("leaves a rebound with an unrecognised subType uncounted rather than guessing", () => {
    const result = deriveGameEventStats(
      [event({ eventType: "rebound", subType: "team", playerId: CURRY, description: "Curry REBOUND" })],
      NAMES,
    );

    expect(result.get(CURRY)?.rebounds).toBe(0);
  });

  it("defaults a made shot's point value from its eventType when value is missing", () => {
    const events = [
      event({ eventType: "3pt", playerId: CURRY, success: true, description: "Curry 26' 3PT Jump Shot" }),
      event({ eventType: "2pt", playerId: CURRY, success: true, description: "Curry 12' Jump Shot" }),
    ];

    expect(deriveGameEventStats(events, NAMES).get(CURRY)?.points).toBe(5);
  });
});

// The cases real 2025-26 play-by-play surfaced: before these, every credit
// for a player with an accented or shared surname was dropped.
describe("deriveGameEventStats — credit names as NBA actually writes them", () => {
  it("credits an accented player from an unaccented suffix", () => {
    const jokic = "jokic-id";
    const names = new Map(NAMES).set(jokic, { firstName: "Nikola", lastName: "Jokić" });

    const result = deriveGameEventStats(
      [madeShot("3pt", CURRY, "Johnson 26' 3PT Jump Shot (5 PTS) (Jokic 1 AST)", 3), appearsInGame(jokic)],
      names,
    );

    expect(result.get(jokic)?.assists).toBe(1);
  });

  it("tells teammates apart by the initial NBA prefixes to a shared surname", () => {
    const lebron = "lebron-id";
    const bronny = "bronny-id";
    const names = new Map(NAMES)
      .set(lebron, { firstName: "LeBron", lastName: "James" })
      .set(bronny, { firstName: "Bronny", lastName: "James" });

    const result = deriveGameEventStats(
      [
        madeShot("2pt", CURRY, "Kennard 21' Jump Shot (2 PTS) (L. James 1 AST)", 2),
        appearsInGame(lebron),
        appearsInGame(bronny),
      ],
      names,
    );

    expect(result.get(lebron)?.assists).toBe(1);
    // No credit means no stat line at all for Bronny here.
    expect(result.get(bronny)?.assists ?? 0).toBe(0);
  });

  it("accepts a longer first-name prefix like 'St. Curry'", () => {
    const result = deriveGameEventStats(
      [madeShot("3pt", GREEN, "Porzingis 26' 3PT Jump Shot (14 PTS) (St. Curry 1 AST)", 3), appearsInGame(CURRY)],
      NAMES,
    );

    expect(result.get(CURRY)?.assists).toBe(1);
  });

  it("uses team context when opponents share a surname NBA doesn't prefix", () => {
    const jalen = "jalen-green-id";
    const names = new Map(NAMES).set(jalen, { firstName: "Jalen", lastName: "Green" });
    const events = [
      appearsInGame(GREEN, WARRIORS),
      appearsInGame(jalen, SPURS),
      // An assist comes from the shooter's own team…
      madeShot("2pt", CURRY, "Curry 3' Running Dunk (2 PTS) (Green 1 AST)", 2, WARRIORS),
      // …a block from the other one.
      missedShot("2pt", CURRY, "MISS Curry 6' Layup (Green 1 BLK)", WARRIORS),
    ];

    const result = deriveGameEventStats(events, names);

    expect(result.get(GREEN)?.assists).toBe(1);
    expect(result.get(GREEN)?.blocks).toBe(0);
    expect(result.get(jalen)?.blocks).toBe(1);
    expect(result.get(jalen)?.assists).toBe(0);
  });

  it("still refuses to guess between same-team players with the same initial", () => {
    const seth = "seth-curry-id";
    const names = new Map(NAMES).set(seth, { firstName: "Seth", lastName: "Curry" });

    const result = deriveGameEventStats(
      [madeShot("2pt", GREEN, "Green 3' Layup (2 PTS) (S. Curry 1 AST)", 2), appearsInGame(CURRY), appearsInGame(seth)],
      names,
    );

    expect(result.get(CURRY)?.assists ?? 0).toBe(0);
    expect(result.get(seth)?.assists ?? 0).toBe(0);
  });
});

describe("buildGameRoster", () => {
  it("keeps each acting player's folded names and team, and skips team rows", () => {
    const roster = buildGameRoster([appearsInGame(CURRY), event({ description: "Warriors Rebound" })], NAMES);

    expect(roster).toEqual(new Map([[CURRY, { surname: "curry", firstInitial: "s", teamId: WARRIORS }]]));
  });

  it("skips a player missing from the name lookup", () => {
    expect(buildGameRoster([appearsInGame("unknown-id")], NAMES).size).toBe(0);
  });
});

describe("credit name matching", () => {
  it("folds accents and case", () => {
    expect(foldName("Jokić")).toBe("jokic");
    expect(foldName("  Dončić ")).toBe("doncic");
  });

  it("matches a bare surname or a prefix starting with the first initial", () => {
    const lebron = { surname: "james", firstInitial: "l", teamId: WARRIORS };
    expect(creditNameMatches("james", lebron)).toBe(true);
    expect(creditNameMatches("l. james", lebron)).toBe(true);
    expect(creditNameMatches("b. james", lebron)).toBe(false);
    expect(creditNameMatches("jameson", lebron)).toBe(false);
  });

  it("returns null when the suffix is absent", () => {
    const roster = buildGameRoster([appearsInGame(CURRY)], NAMES);
    expect(resolveSecondaryPlayer("Curry 12' Jump Shot (2 PTS)", "assists", roster)).toBeNull();
  });
});
