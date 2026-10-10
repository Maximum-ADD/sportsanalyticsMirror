import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerArchetypeCard } from "./PlayerArchetypeCard";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import type { Player, PlayerArchetypeResponse, StyleMapResponse, Team } from "@/types/nba";

const TEAM: Team = {
  id: "team-1",
  nbaTeamId: 1610612747,
  name: "Lakers",
  abbreviation: "LAL",
  city: "Los Angeles",
  conference: "West",
  division: "Pacific",
  logoUrl: null,
};

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-2",
    nbaPlayerId: 203507,
    firstName: "Giannis",
    lastName: "Antetokounmpo",
    position: "F",
    heightInches: 83,
    weightLbs: 243,
    jerseyNumber: "34",
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
    ...overrides,
  };
}

function makeResponse(overrides: Partial<PlayerArchetypeResponse> = {}): PlayerArchetypeResponse {
  return {
    playerId: "player-1",
    season: "2025-26",
    archetype: {
      playerId: "player-1",
      season: "2025-26",
      archetypes: [
        { label: "Point forward", clusterId: 3, rank: 1, weight: 0.68 },
        { label: "Scoring wing", clusterId: 7, rank: 2, weight: 0.19 },
        { label: "Scoring guard", clusterId: 1, rank: 3, weight: 0.11 },
      ],
      similarPlayers: [
        { player: makePlayer(), rank: 1, similarityScore: 88.2 },
        {
          player: makePlayer({ id: "player-3", nbaPlayerId: 203110, firstName: "Draymond", lastName: "Green" }),
          rank: 2,
          similarityScore: 83.4,
        },
      ],
      featureVector: [0.4, -1.1, 0.8],
      distanceToCentroid: 0.71,
      plot: { x: -1.62, y: 1.44 },
    },
    ...overrides,
  };
}

describe("PlayerArchetypeCard", () => {
  describe("a player the model placed", () => {
    it("shows every archetype, strongest first", () => {
      renderWithProviders(<PlayerArchetypeCard data={makeResponse()} />);

      expect(screen.getByText("Point forward")).toBeInTheDocument();
      expect(screen.getByText("Scoring wing")).toBeInTheDocument();
      expect(screen.getByText("Scoring guard")).toBeInTheDocument();
    });

    it("rounds the weights to whole percents", () => {
      // The weights are an ordering, not a confidence. Rendering 68.4%
      // would claim a precision the model does not have.
      renderWithProviders(<PlayerArchetypeCard data={makeResponse()} />);

      expect(screen.getByText("68%")).toBeInTheDocument();
      expect(screen.getByText("19%")).toBeInTheDocument();
    });

    it("links each similar player to their own profile", () => {
      renderWithProviders(<PlayerArchetypeCard data={makeResponse()} />);

      const link = screen.getByRole("link", { name: /Giannis Antetokounmpo/ });
      expect(link).toHaveAttribute("href", "/players/player-2");
      // The whole tile is the link, so it has to say what it opens.
      expect(link).toHaveTextContent("View profile");
    });

    it("names the closest match rather than numbering it", () => {
      // "#1" beside a face reads as a ranking of the players themselves,
      // which is the one thing this card must not imply.
      renderWithProviders(<PlayerArchetypeCard data={makeResponse()} />);

      expect(screen.getByText("Most similar")).toBeInTheDocument();
      expect(screen.getByText("#2")).toBeInTheDocument();
      expect(screen.queryByText("#1")).not.toBeInTheDocument();
    });

    it("shows the listed position beside the archetype", () => {
      // Position is not a feature of the model, so about a third of
      // players land in an archetype that does not match their listed
      // slot. Showing it makes that deliberate rather than a mistake.
      renderWithProviders(
        <PlayerArchetypeCard data={makeResponse()} listedPosition="F" />
      );

      expect(screen.getByText(/Listed F\./)).toBeInTheDocument();
    });

    it("reads fine when no position is known", () => {
      renderWithProviders(<PlayerArchetypeCard data={makeResponse()} />);

      expect(screen.queryByText(/Listed/)).not.toBeInTheDocument();
      expect(screen.getByText(/Sits between archetypes/)).toBeInTheDocument();
    });

    it("says the similarity is of style rather than of quality", () => {
      // The single most misreadable thing on this card: a high score means
      // they play alike, never that they are equally good.
      renderWithProviders(<PlayerArchetypeCard data={makeResponse()} />);

      expect(screen.getByText(/not in quality/i)).toBeInTheDocument();
    });

    it("reads as one archetype, not several, for a specialist", () => {
      const response = makeResponse();
      response.archetype!.archetypes = [
        { label: "Catch-and-shoot wing", clusterId: 2, rank: 1, weight: 0.88 },
      ];
      renderWithProviders(<PlayerArchetypeCard data={response} />);

      expect(screen.getByText(/sits clearly inside one archetype/i)).toBeInTheDocument();
    });

    it("has no accessibility violations", async () => {
      const { container } = renderWithProviders(<PlayerArchetypeCard data={makeResponse()} />);
      await expectNoAccessibilityViolations(container);
    });
  });

  describe("the style map", () => {
    const styleMap: StyleMapResponse = {
      season: "2025-26",
      players: [
        { playerId: "player-1", firstName: "LeBron", lastName: "James", clusterId: 3, plotX: -1.6, plotY: 1.4 },
        { playerId: "player-2", firstName: "Giannis", lastName: "Antetokounmpo", clusterId: 3, plotX: -1.9, plotY: 1.0 },
        { playerId: "player-9", firstName: "Stephen", lastName: "Curry", clusterId: 1, plotX: 1.9, plotY: 1.2 },
      ],
      archetypes: [{ clusterId: 3, label: "Point forward", memberCount: 19 }],
    };

    it("is left out entirely when the map has not loaded", () => {
      // Supplementary, not a third source of truth: the bars and tiles say
      // everything it shows, so its absence must cost nothing.
      renderWithProviders(<PlayerArchetypeCard data={makeResponse()} />);
      expect(screen.queryByText("Style map")).not.toBeInTheDocument();
    });

    it("is left out when the season has no placed players", () => {
      renderWithProviders(
        <PlayerArchetypeCard
          data={makeResponse()}
          styleMap={{ ...styleMap, players: [] }}
        />
      );
      expect(screen.queryByText("Style map")).not.toBeInTheDocument();
    });

    it("names each mark, so identity is never colour alone", () => {
      renderWithProviders(<PlayerArchetypeCard data={makeResponse()} styleMap={styleMap} />);

      expect(screen.getByText("Style map")).toBeInTheDocument();
      expect(screen.getByText("This player")).toBeInTheDocument();
      // The legend names the player's own archetype rather than saying
      // "your group", so the colour ties back to the bars beside it.
      expect(screen.getAllByText("Point forward").length).toBeGreaterThan(1);
      expect(screen.getByText("Everyone else")).toBeInTheDocument();
    });

    it("has no accessibility violations with the map shown", async () => {
      const { container } = renderWithProviders(
        <PlayerArchetypeCard data={makeResponse()} styleMap={styleMap} />
      );
      await expectNoAccessibilityViolations(container);
    });
  });

  describe("a player the model did not place", () => {
    it("explains why rather than showing an error", () => {
      // The minutes-floor case is normal for deep-bench players, and has to
      // read as a deliberate decision rather than as something broken.
      renderWithProviders(
        <PlayerArchetypeCard data={makeResponse({ archetype: null })} />
      );

      expect(screen.getByText(/Not enough minutes in 2025-26/i)).toBeInTheDocument();
    });

    it("shows the same explanation when the archetype list came back empty", () => {
      const response = makeResponse();
      response.archetype!.archetypes = [];
      renderWithProviders(<PlayerArchetypeCard data={response} />);

      expect(screen.getByText(/Not enough minutes/i)).toBeInTheDocument();
    });

    it("has no accessibility violations", async () => {
      const { container } = renderWithProviders(
        <PlayerArchetypeCard data={makeResponse({ archetype: null })} />
      );
      await expectNoAccessibilityViolations(container);
    });
  });

  describe("a deployment with no fitted season", () => {
    it("says so without blaming the player", () => {
      renderWithProviders(
        <PlayerArchetypeCard data={makeResponse({ season: null, archetype: null })} />
      );

      expect(screen.getByText(/No season has been analysed/i)).toBeInTheDocument();
      expect(screen.queryByText(/Not enough minutes/i)).not.toBeInTheDocument();
    });
  });

  describe("a player with archetypes but no neighbours", () => {
    it("does not leave the list silently empty", () => {
      const response = makeResponse();
      response.archetype!.similarPlayers = [];
      renderWithProviders(<PlayerArchetypeCard data={response} />);

      expect(screen.getByText(/No similar players for this season/i)).toBeInTheDocument();
    });
  });
});
