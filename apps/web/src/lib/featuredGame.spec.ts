import { describe, expect, it } from "vitest";
import { createEloRatingIndex, readEloRating, selectFeaturedGame, STARTING_ELO_RATING } from "./featuredGame";
import type { TeamEloRating } from "@/types/nba";

interface TestGame {
  id: string;
  homeTeamElo: number;
  awayTeamElo: number;
}

function readTestRatings(game: TestGame) {
  return { homeTeamElo: game.homeTeamElo, awayTeamElo: game.awayTeamElo };
}

describe("selectFeaturedGame", () => {
  it("picks the game with the highest combined Elo rating", () => {
    const games: TestGame[] = [
      { id: "a", homeTeamElo: 1500, awayTeamElo: 1550 },
      { id: "b", homeTeamElo: 1620, awayTeamElo: 1580 },
      { id: "c", homeTeamElo: 1700, awayTeamElo: 1400 },
    ];

    expect(selectFeaturedGame(games, readTestRatings)?.id).toBe("b");
  });

  it("breaks a tie on the combined rating with the single highest-rated team", () => {
    const games: TestGame[] = [
      { id: "even", homeTeamElo: 1600, awayTeamElo: 1600 },
      { id: "has-the-best-team", homeTeamElo: 1500, awayTeamElo: 1700 },
    ];

    expect(selectFeaturedGame(games, readTestRatings)?.id).toBe("has-the-best-team");
  });

  it("keeps the caller's order when both ratings tie", () => {
    const games: TestGame[] = [
      { id: "first", homeTeamElo: 1550, awayTeamElo: 1650 },
      { id: "second", homeTeamElo: 1650, awayTeamElo: 1550 },
    ];

    expect(selectFeaturedGame(games, readTestRatings)?.id).toBe("first");
  });

  it("returns null when there are no games", () => {
    expect(selectFeaturedGame([], readTestRatings)).toBeNull();
  });
});

describe("readEloRating", () => {
  const ratings = [{ team: { id: "team-1", nbaTeamId: 1610612759 }, elo: 1650.5 }] as TeamEloRating[];

  it("looks a team up by whichever key the index was built on", () => {
    expect(readEloRating(createEloRatingIndex(ratings, (rating) => rating.team.nbaTeamId), 1610612759)).toBe(1650.5);
    expect(readEloRating(createEloRatingIndex(ratings, (rating) => rating.team.id), "team-1")).toBe(1650.5);
  });

  it("treats an unrated team, or unavailable ratings, as the starting rating", () => {
    expect(readEloRating(createEloRatingIndex(ratings, (rating) => rating.team.id), "team-2")).toBe(STARTING_ELO_RATING);
    expect(readEloRating(createEloRatingIndex(undefined, (rating) => rating.team.id), "team-1")).toBe(STARTING_ELO_RATING);
  });
});
