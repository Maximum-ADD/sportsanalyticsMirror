import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import {
  makeComparable,
  makeEmptyBecomePro,
  makeMyBecomePro,
  makePlayer,
  makeProspectSeason,
  makeProspectValuation,
  makeSeasonAverages,
} from "@/test/becomeProFixtures";
import { deleteProspectSeason, fetchMyBecomePro } from "@/lib/becomeProApi";
import { BecomeProPage } from "./BecomeProPage";

// Every Become Pro fetcher the page and its panels can reach, so nothing in
// this file can touch a real server.
vi.mock("@/lib/becomeProApi", () => ({
  MY_BECOME_PRO_QUERY_KEY: ["myBecomePro"],
  fetchMyBecomePro: vi.fn(),
  createProspectSeason: vi.fn(),
  updateProspectSeason: vi.fn(),
  deleteProspectSeason: vi.fn(),
  createProspectGame: vi.fn(),
  updateProspectGame: vi.fn(),
  deleteProspectGame: vi.fn(),
  invalidateBecomeProQueries: vi.fn().mockResolvedValue(undefined),
}));

const COMPARABLES = [
  makeComparable({ player: makePlayer({ id: "p-1", firstName: "Jalen", lastName: "Duren" }), similarity: 0.87 }),
  makeComparable({ player: makePlayer({ id: "p-2", firstName: "Ausar", lastName: "Thompson" }), similarity: 0.81 }),
];

describe("BecomeProPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchMyBecomePro).mockResolvedValue(makeMyBecomePro());
    vi.mocked(deleteProspectSeason).mockResolvedValue({ deleted: true });
  });

  it("says the page is private to the user", async () => {
    renderWithProviders(<BecomeProPage />);

    expect(await screen.findByRole("heading", { level: 1, name: /become pro/i })).toBeInTheDocument();
    expect(screen.getByText(/only you can see this page/i)).toBeInTheDocument();
  });

  it("shows a loading state first", () => {
    vi.mocked(fetchMyBecomePro).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<BecomeProPage />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("offers a working retry when the page cannot load", async () => {
    vi.mocked(fetchMyBecomePro).mockRejectedValueOnce(new Error("down"));
    const user = userEvent.setup();

    renderWithProviders(<BecomeProPage />);

    expect(await screen.findByText(/could not load your become pro page/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(await screen.findByRole("heading", { level: 1, name: /become pro/i })).toBeInTheDocument();
  });

  describe("before any season exists", () => {
    beforeEach(() => {
      vi.mocked(fetchMyBecomePro).mockResolvedValue(makeEmptyBecomePro());
    });

    // The setup form IS the page — never an empty value card or a zero.
    it("opens on the form to start a season", async () => {
      renderWithProviders(<BecomeProPage />);

      expect(await screen.findByRole("form", { name: "Start a season" })).toBeInTheDocument();
      expect(screen.queryByText(/projected value/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    });

    it("cannot be cancelled, because there is nothing to go back to", async () => {
      renderWithProviders(<BecomeProPage />);

      await screen.findByRole("form", { name: "Start a season" });
      expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    });

    it("explains how the valuation works", async () => {
      renderWithProviders(<BecomeProPage />);

      expect(await screen.findByText(/how the valuation works/i)).toBeInTheDocument();
      expect(screen.getByText(/no language model is involved/i)).toBeInTheDocument();
    });
  });

  describe("a valued season", () => {
    it("describes the season in the header", async () => {
      renderWithProviders(<BecomeProPage />);

      expect(await screen.findByText(/2025-26 · NCAA Division II · G · Riverside College/)).toBeInTheDocument();
    });

    it("shows the season line worked out from the games", async () => {
      renderWithProviders(<BecomeProPage />);

      expect(await screen.findByText("Season line")).toBeInTheDocument();
      expect(screen.getByText("PPG")).toBeInTheDocument();
    });

    it("lists the logged games", async () => {
      renderWithProviders(<BecomeProPage />);

      expect(await screen.findByRole("table")).toHaveTextContent("Lincoln High");
    });

    it("shows the projected value and the pick behind it", async () => {
      renderWithProviders(<BecomeProPage />);

      expect(await screen.findByText("$3.52M")).toBeInTheDocument();
      expect(screen.getAllByText("Pick 18").length).toBeGreaterThan(0);
    });

    // A zero-attempt percentage is 0 in the type and meaningless on screen.
    it("shows a dash, not 0%, for a shot the user never took", async () => {
      vi.mocked(fetchMyBecomePro).mockResolvedValue(
        makeMyBecomePro({
          seasonAverages: makeSeasonAverages({ threesAttemptedPerGame: 0, threePointPercentage: 0 }),
        })
      );

      renderWithProviders(<BecomeProPage />);

      const tile = (await screen.findByText("3P%")).parentElement as HTMLElement;
      expect(within(tile).getByText("—")).toBeInTheDocument();
    });

    it("warns that a very short log moves a lot", async () => {
      vi.mocked(fetchMyBecomePro).mockResolvedValue(
        makeMyBecomePro({ seasonAverages: makeSeasonAverages({ gamesPlayed: 2 }), valuation: null })
      );

      renderWithProviders(<BecomeProPage />);

      expect(await screen.findByText(/only 2 games/i)).toBeInTheDocument();
    });
  });

  describe("against NBA rookies", () => {
    it("names each comparable with the rookie season it was measured on", async () => {
      vi.mocked(fetchMyBecomePro).mockResolvedValue(
        makeMyBecomePro({ valuation: makeProspectValuation({ comparables: COMPARABLES }) })
      );

      renderWithProviders(<BecomeProPage />);

      const duren = await screen.findByRole("link", { name: "Jalen Duren" });
      expect(duren).toHaveAttribute("href", "/players/p-1");
      expect(screen.getAllByText(/2024-25 rookie season · 87% similar/).length).toBeGreaterThan(0);
    });

    // The similarity was measured on the translated line, so that is the line
    // plotted — and it says so in words.
    it("plots the level-adjusted line and labels it", async () => {
      vi.mocked(fetchMyBecomePro).mockResolvedValue(
        makeMyBecomePro({ valuation: makeProspectValuation({ comparables: COMPARABLES, levelFactor: 0.62 }) })
      );

      renderWithProviders(<BecomeProPage />);

      expect((await screen.findAllByText("You (level-adjusted)")).length).toBeGreaterThan(0);
      expect(screen.getByText(/translated by the 0\.62 level factor/)).toBeInTheDocument();
    });

    it("plots the logged line as-is at Division I", async () => {
      vi.mocked(fetchMyBecomePro).mockResolvedValue(
        makeMyBecomePro({ valuation: makeProspectValuation({ comparables: COMPARABLES, levelFactor: 1 }) })
      );

      renderWithProviders(<BecomeProPage />);

      await screen.findByRole("link", { name: "Jalen Duren" });
      expect(screen.queryByText(/level-adjusted/)).not.toBeInTheDocument();
      expect(screen.getAllByText("You").length).toBeGreaterThan(0);
    });

    it("lists real players drafted at the projected pick", async () => {
      vi.mocked(fetchMyBecomePro).mockResolvedValue(
        makeMyBecomePro({
          valuation: makeProspectValuation({
            comparables: COMPARABLES,
            slotAlumni: [{ player: makePlayer({ id: "p-9", firstName: "Josh", lastName: "Hart" }), draftYear: 2017 }],
          }),
        })
      );

      renderWithProviders(<BecomeProPage />);

      expect(await screen.findByText(/drafted at pick 18/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Josh Hart" })).toHaveAttribute("href", "/players/p-9");
    });

    it("has no comparison section before the season is valued", async () => {
      vi.mocked(fetchMyBecomePro).mockResolvedValue(
        makeMyBecomePro({
          seasons: [makeProspectSeason({ gamesLogged: 7 })],
          valuationState: "BELOW_GAMES_FLOOR",
          valuation: null,
        })
      );

      renderWithProviders(<BecomeProPage />);

      expect(await screen.findByText(/3 more games needed/)).toBeInTheDocument();
      expect(screen.queryByText("Against NBA rookies")).not.toBeInTheDocument();
    });
  });

  describe("managing seasons", () => {
    it("switches between seasons", async () => {
      vi.mocked(fetchMyBecomePro).mockResolvedValue(
        makeMyBecomePro({
          seasons: [makeProspectSeason(), makeProspectSeason({ id: "season-0", season: "2024-25" })],
        })
      );
      const user = userEvent.setup();

      renderWithProviders(<BecomeProPage />);

      await user.click(await screen.findByRole("radio", { name: "2024-25" }));

      await waitFor(() => expect(fetchMyBecomePro).toHaveBeenLastCalledWith("season-0"));
    });

    it("offers no season picker with only one season", async () => {
      renderWithProviders(<BecomeProPage />);

      await screen.findByRole("heading", { level: 1, name: /become pro/i });
      expect(screen.queryByRole("radiogroup", { name: "Season" })).not.toBeInTheDocument();
    });

    it("edits the season's details in place", async () => {
      const user = userEvent.setup();

      renderWithProviders(<BecomeProPage />);

      await user.click(await screen.findByRole("button", { name: /edit details/i }));
      const form = screen.getByRole("form", { name: "Edit season details" });
      expect(within(form).getByLabelText(/team/i)).toHaveValue("Riverside College");

      await user.click(within(form).getByRole("button", { name: /cancel/i }));
      expect(screen.queryByRole("form", { name: "Edit season details" })).not.toBeInTheDocument();
    });

    it("starts another season and can back out of it", async () => {
      const user = userEvent.setup();

      renderWithProviders(<BecomeProPage />);

      await user.click(await screen.findByRole("button", { name: /add a season/i }));
      expect(screen.getByRole("form", { name: "Start a season" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /cancel/i }));
      expect(await screen.findByRole("table")).toBeInTheDocument();
    });

    // Deleting a season takes every game with it, so it asks first.
    it("asks before deleting a season, then deletes it", async () => {
      const user = userEvent.setup();

      renderWithProviders(<BecomeProPage />);

      await user.click(await screen.findByRole("button", { name: /delete season/i }));
      expect(deleteProspectSeason).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: /delete 2025-26 and its games/i }));
      await waitFor(() => expect(deleteProspectSeason).toHaveBeenCalledWith("season-1"));
    });

    it("keeps the season when the delete is called off", async () => {
      const user = userEvent.setup();

      renderWithProviders(<BecomeProPage />);

      await user.click(await screen.findByRole("button", { name: /delete season/i }));
      await user.click(screen.getByRole("button", { name: /keep it/i }));

      expect(deleteProspectSeason).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /delete season/i })).toBeInTheDocument();
    });
  });

  it("has no accessibility violations", async () => {
    vi.mocked(fetchMyBecomePro).mockResolvedValue(
      makeMyBecomePro({ valuation: makeProspectValuation({ comparables: COMPARABLES }) })
    );

    const { container } = renderWithProviders(<BecomeProPage />);

    await screen.findByRole("link", { name: "Jalen Duren" });
    await expectNoAccessibilityViolations(container);
  });

  it("has no accessibility violations before a season exists", async () => {
    vi.mocked(fetchMyBecomePro).mockResolvedValue(makeEmptyBecomePro());

    const { container } = renderWithProviders(<BecomeProPage />);

    await screen.findByRole("form", { name: "Start a season" });
    await expectNoAccessibilityViolations(container);
  });
});
