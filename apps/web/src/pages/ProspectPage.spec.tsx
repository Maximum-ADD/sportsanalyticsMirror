import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import {
  makeProspectProfile,
  makeProspectSeason,
  makeProspectValuation,
} from "@/test/becomeProFixtures";
import { fetchProspect } from "@/lib/becomeProApi";
import { deriveSeasonAverages } from "@/lib/prospectValue";
import { ProspectPage } from "./ProspectPage";
import type { Player, ProspectProfile } from "@/types/nba";

vi.mock("@/lib/becomeProApi", () => ({
  fetchProspect: vi.fn(),
  prospectQueryKey: (username: string) => ["prospect", username],
  createProspectGame: vi.fn(),
  deleteProspectGame: vi.fn(),
  uploadProspectEvidence: vi.fn(),
  deleteProspectEvidence: vi.fn(),
  invalidateProspectQueries: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useParams: () => ({ username: "kiran" }) };
});

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    nbaPlayerId: 201939,
    firstName: "Josh",
    lastName: "Hart",
    position: "G",
    heightInches: 76,
    weightLbs: 215,
    jerseyNumber: "3",
    headshotUrl: null,
    teamId: "team-1",
    team: null,
    birthDate: null,
    school: null,
    country: null,
    lastAffiliation: null,
    seasonExp: null,
    rosterStatus: null,
    draftYear: 2017,
    draftRound: 1,
    draftNumber: 30,
    ...overrides,
  };
}

// StatTile renders its mono label and its numeral as siblings, so the tile is
// the label's parent. Scoping to it matters: PPG 24 also appears in the game
// table, and FG% and TS% can legitimately be the same figure.
function tileValue(label: string): string {
  const tile = screen.getByText(label).parentElement;
  return tile?.textContent?.replace(label, "").trim() ?? "";
}

function render(profile: Partial<ProspectProfile> = {}) {
  vi.mocked(fetchProspect).mockResolvedValue(makeProspectProfile(profile));
  return renderWithProviders(<ProspectPage />);
}

describe("ProspectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the prospect's name, rank and season context", async () => {
    render();

    expect(await screen.findByRole("heading", { level: 1, name: "Kiran" })).toBeInTheDocument();
    expect(screen.getByLabelText("Rank 12 on the Become Pro board")).toBeInTheDocument();
    expect(screen.getByText(/2025-26 · NCAA Division II · G/)).toBeInTheDocument();
  });

  it("shows the derived season line as stat tiles", async () => {
    render();

    expect(await screen.findByText("PPG")).toBeInTheDocument();
    expect(tileValue("PPG")).toBe("24");
    expect(tileValue("Games")).toBe("14");
  });

  // A percentage from zero attempts is 0 and meaningless. It is suppressed at
  // the edge rather than by widening SeasonAverages, which every NBA page uses.
  it("suppresses a shooting percentage with no attempts behind it", async () => {
    const averages = deriveSeasonAverages([
      {
        gameDate: "2026-01-15",
        opponent: "Lincoln High",
        minutes: 20,
        points: 4,
        rebounds: 3,
        assists: 1,
        steals: 0,
        blocks: 0,
        turnovers: 1,
        fieldGoalsMade: 2,
        fieldGoalsAttempted: 5,
        threesMade: 0,
        threesAttempted: 0,
        freeThrowsMade: 0,
        freeThrowsAttempted: 0,
      },
    ]);

    render({ seasonAverages: averages });
    await screen.findByText("3P%");

    // Field goals were attempted, so that one still shows a real figure.
    expect(tileValue("FG%")).toBe("40%");
    // Threes and free throws were not — those render as an em dash, not 0%.
    expect(tileValue("3P%")).toBe("—");
    expect(tileValue("FT%")).toBe("—");
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows the value card with its projection", async () => {
    render();

    expect(await screen.findByText("Slot 18")).toBeInTheDocument();
    expect(screen.getByText("$4.37M")).toBeInTheDocument();
  });

  describe("an unranked prospect", () => {
    it("says so in words with the reason beside it", async () => {
      render({
        rank: null,
        rankState: "BELOW_GAMES_FLOOR",
        seasons: [makeProspectSeason({ gamesLogged: 7 })],
        valuation: makeProspectValuation({
          projectedDraftSlot: null,
          projectedValueUsd: null,
          projectedValueLowUsd: null,
          projectedValueHighUsd: null,
        }),
      });

      expect(await screen.findByText(/not yet ranked/i)).toBeInTheDocument();
      expect(screen.getAllByText(/3 more games needed/i).length).toBeGreaterThan(0);
    });
  });

  describe("viewing your own season", () => {
    it("offers the game entry form", async () => {
      render({ isSelf: true });

      expect(await screen.findByRole("form", { name: /add a game/i })).toBeInTheDocument();
    });

    it("offers the evidence uploader", async () => {
      render({ isSelf: true });

      expect(await screen.findByLabelText(/choose a document/i)).toBeInTheDocument();
    });
  });

  // The single most important negative case in the feature.
  describe("viewing someone else's season", () => {
    it("offers no entry form", async () => {
      render({ isSelf: false });
      await screen.findByRole("heading", { level: 1, name: "Kiran" });

      expect(screen.queryByRole("form", { name: /add a game/i })).not.toBeInTheDocument();
    });

    it("offers no evidence upload", async () => {
      render({ isSelf: false });
      await screen.findByRole("heading", { level: 1, name: "Kiran" });

      expect(screen.queryByLabelText(/choose a document/i)).not.toBeInTheDocument();
    });

    it("offers no way to remove a game", async () => {
      render({ isSelf: false });
      await screen.findByRole("heading", { level: 1, name: "Kiran" });

      expect(screen.queryByRole("button", { name: /remove the game/i })).not.toBeInTheDocument();
    });
  });

  describe("comparables", () => {
    const withComparables = {
      valuation: makeProspectValuation({
        comparables: [
          {
            player: makePlayer(),
            seasonAverages: makeProspectProfile().seasonAverages,
            similarity: 0.87,
          },
        ],
        slotAlumni: [{ player: makePlayer(), draftYear: 2017 }],
      }),
    };

    it("names each comparable with its similarity", async () => {
      render(withComparables);

      expect(await screen.findByText(/87% similar/)).toBeInTheDocument();
    });

    it("links a comparable to the real player's page", async () => {
      render(withComparables);

      const links = await screen.findAllByRole("link", { name: /Josh Hart/ });
      expect(links[0]).toHaveAttribute("href", "/players/player-1");
    });

    // The claim has to be bounded in words, not left for the reader to infer
    // from a radar shape.
    it("says similarity is a shape match rather than equivalence", async () => {
      render(withComparables);

      expect(await screen.findByText(/not that the players are equivalent/i)).toBeInTheDocument();
    });

    it("shows who was actually drafted at the projected slot", async () => {
      render(withComparables);

      expect(await screen.findByText(/drafted at this slot/i)).toBeInTheDocument();
      expect(screen.getByText("2017")).toBeInTheDocument();
    });
  });

  describe("a prospect with more than one season", () => {
    const twoSeasons = {
      seasons: [
        makeProspectSeason({ id: "season-1", season: "2025-26" }),
        makeProspectSeason({ id: "season-2", season: "2024-25" }),
      ],
      activeSeasonId: "season-1",
    };

    it("offers each season as a radio option", async () => {
      render(twoSeasons);

      const group = await screen.findByRole("radiogroup", { name: /season/i });
      expect(group).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "2025-26" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "2024-25" })).not.toBeChecked();
    });

    it("re-reads the profile for the season picked", async () => {
      const user = userEvent.setup();
      render(twoSeasons);

      await user.click(await screen.findByRole("radio", { name: "2024-25" }));

      await vi.waitFor(() => {
        expect(fetchProspect).toHaveBeenCalledWith("kiran", "season-2");
      });
    });
  });

  // One season needs no picker — a radiogroup with a single option is noise.
  it("shows no season picker for a single season", async () => {
    render();
    await screen.findByRole("heading", { level: 1, name: "Kiran" });

    expect(screen.queryByRole("radiogroup", { name: /season/i })).not.toBeInTheDocument();
  });

  it("copes with a profile carrying no season at all", async () => {
    render({
      seasons: [],
      rank: null,
      rankState: "BELOW_GAMES_FLOOR",
      valuation: makeProspectValuation({ projectedValueUsd: null, projectedDraftSlot: null }),
    });

    expect(await screen.findByText(/no season logged yet/i)).toBeInTheDocument();
  });

  it("recovers from a failed load", async () => {
    vi.mocked(fetchProspect).mockRejectedValueOnce(new Error("network down"));
    vi.mocked(fetchProspect).mockResolvedValue(makeProspectProfile());
    const user = userEvent.setup();

    renderWithProviders(<ProspectPage />);
    await user.click(await screen.findByRole("button", { name: /retry/i }));

    expect(await screen.findByRole("heading", { level: 1, name: "Kiran" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render({ isSelf: true });
    await screen.findByRole("heading", { level: 1, name: "Kiran" });

    await expectNoAccessibilityViolations(container);
  });
});
