import { describe, expect, it } from "vitest";
import { pickHighlightCards, type ReliablePlayer } from "./PlayerCards";
import type { Player, PredictedScorer, Team } from "@/types/nba";

const TEAM: Team = {
  id: "team-1",
  nbaTeamId: 1,
  name: "Lakers",
  abbreviation: "LAL",
  city: "Los Angeles",
  conference: "West",
  division: "Pacific",
  logoUrl: null,
};

function makePlayer(id: string, name: string): Player {
  return {
    id,
    nbaPlayerId: 1,
    firstName: name,
    lastName: "Test",
    position: "F",
    heightInches: 80,
    weightLbs: 220,
    jerseyNumber: "0",
    headshotUrl: null,
    teamId: TEAM.id,
    team: TEAM,
    birthDate: null,
    school: null,
    country: null,
    lastAffiliation: null,
    seasonExp: null,
    rosterStatus: null,
    draftYear: null,
    draftRound: null,
    draftNumber: null,
  };
}

function makeEntry(id: string, predictedPoints: number, rate: number | null): ReliablePlayer {
  const scorer: PredictedScorer = { player: makePlayer(id, id), predictedPoints, gamesConsidered: 10 };
  return {
    scorer,
    team: TEAM,
    reliability: rate === null ? null : { closeGames: Math.round(rate * 10), totalGames: 10, rate },
  };
}

describe("pickHighlightCards", () => {
  it("returns nothing for an empty pool", () => {
    expect(pickHighlightCards([])).toEqual([]);
  });

  it("picks the highest predicted scorer for match and the most reliable player for consistency", () => {
    const players = [
      makeEntry("mid", 20, 0.5),
      makeEntry("most-reliable", 18, 0.95),
      makeEntry("top-scorer", 32, 0.6),
    ];

    const cards = pickHighlightCards(players);

    expect(cards.map((card) => card.kind)).toEqual(["match", "consistency"]);
    expect(cards.find((card) => card.kind === "match")!.entry.scorer.player.id).toBe("top-scorer");
    expect(cards.find((card) => card.kind === "consistency")!.entry.scorer.player.id).toBe("most-reliable");
  });

  it("never shows the same player twice across categories", () => {
    // One player dominates every angle: highest points AND highest
    // reliability. Consistency should be dropped rather than duplicating
    // the Man of the Match card under a different label.
    const players = [makeEntry("dominant", 30, 0.95), makeEntry("second", 20, 0.3)];

    const cards = pickHighlightCards(players);
    const ids = cards.map((card) => card.entry.scorer.player.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("falls back to a runner-up CONSISTENCY pick, not a second Man of the Match, to fill an extra slot", () => {
    // The bug this guards against: a missing category used to fall back to
    // duplicate "Man of the match" cards, which read as if the model only
    // had one real opinion. The runner-up fill must prefer reliability
    // rank instead.
    const players = [makeEntry("a", 25, 0.4), makeEntry("b", 20, 0.9), makeEntry("c", 15, 0.7)];

    const cards = pickHighlightCards(players, 3);

    expect(cards.map((card) => card.kind)).toEqual(["match", "consistency", "consistency"]);
  });

  it("omits consistency (and any runner-up) when no player has reliability data yet", () => {
    const players = [makeEntry("a", 25, null), makeEntry("b", 20, null)];

    const cards = pickHighlightCards(players, 3);

    expect(cards.map((card) => card.kind)).toEqual(["match"]);
  });

  it("caps the result at the pool size rather than padding with duplicates", () => {
    const players = [makeEntry("only", 25, 0.5)];

    const cards = pickHighlightCards(players, 5);

    expect(cards).toHaveLength(1);
  });

  it("defaults to exactly 2 cards (one Man of the Match, one Consistency) when count is omitted", () => {
    const players = [makeEntry("a", 30, 0.9), makeEntry("b", 25, 0.5), makeEntry("c", 20, 0.3)];

    const cards = pickHighlightCards(players);

    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.kind)).toEqual(["match", "consistency"]);
  });
});
