import { describe, expect, it } from "vitest";
import { buildPlayerNameIndex, findPlayerId, findTeamByEspnName, normalizePersonName } from "./injury-matching.js";

const TEAMS = [
  { id: "team-clippers", name: "Clippers" },
  { id: "team-lakers", name: "Lakers" },
  { id: "team-blazers", name: "Trail Blazers" },
  { id: "team-sixers", name: "76ers" },
];

describe("normalizePersonName", () => {
  it("removes accents, case, punctuation and generational suffixes", () => {
    expect(normalizePersonName("Nikola Jokić")).toBe("nikola jokic");
    expect(normalizePersonName("Jimmy Butler III")).toBe("jimmy butler");
    expect(normalizePersonName("Gary Trent Jr.")).toBe("gary trent");
    expect(normalizePersonName("Shai Gilgeous-Alexander")).toBe("shai gilgeous alexander");
    expect(normalizePersonName("De'Aaron Fox")).toBe("deaaron fox");
  });
});

describe("findTeamByEspnName", () => {
  it("matches on the nickname, so ESPN's city spelling doesn't matter", () => {
    expect(findTeamByEspnName("LA Clippers", TEAMS)?.id).toBe("team-clippers");
    expect(findTeamByEspnName("Los Angeles Lakers", TEAMS)?.id).toBe("team-lakers");
    expect(findTeamByEspnName("Portland Trail Blazers", TEAMS)?.id).toBe("team-blazers");
    expect(findTeamByEspnName("Philadelphia 76ers", TEAMS)?.id).toBe("team-sixers");
  });

  it("returns null for a team this app doesn't hold", () => {
    expect(findTeamByEspnName("Seattle SuperSonics", TEAMS)).toBeNull();
  });
});

describe("findPlayerId", () => {
  const index = buildPlayerNameIndex([
    { id: "player-butler", firstName: "Jimmy", lastName: "Butler", teamId: "team-warriors" },
    { id: "player-jokic", firstName: "Nikola", lastName: "Jokić", teamId: "team-nuggets" },
    { id: "player-smith-a", firstName: "Jalen", lastName: "Smith", teamId: "team-bulls" },
    { id: "player-smith-b", firstName: "Jalen", lastName: "Smith", teamId: "team-suns" },
  ]);

  it("matches a unique name, whichever source carries the accent or suffix", () => {
    expect(findPlayerId("Jimmy Butler III", null, index)).toBe("player-butler");
    expect(findPlayerId("Nikola Jokic", "team-nuggets", index)).toBe("player-jokic");
  });

  it("uses the team to pick between two players with the same name", () => {
    expect(findPlayerId("Jalen Smith", "team-suns", index)).toBe("player-smith-b");
  });

  it("links nobody when the team can't settle a shared name, or the name is unknown", () => {
    expect(findPlayerId("Jalen Smith", "team-lakers", index)).toBeNull();
    expect(findPlayerId("Jalen Smith", null, index)).toBeNull();
    expect(findPlayerId("Rookie Unknown", "team-bulls", index)).toBeNull();
  });
});
