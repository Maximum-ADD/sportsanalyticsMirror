import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { makeProspectGame, makeProspectSeason } from "@/test/becomeProFixtures";
import {
  createProspectGame,
  deleteProspectGame,
  invalidateBecomeProQueries,
  updateProspectGame,
} from "@/lib/becomeProApi";
import { ApiError } from "@/lib/apiClient";
import { SeasonEntryPanel } from "./SeasonEntryPanel";
import type { ProspectGame } from "@/types/nba";

vi.mock("@/lib/becomeProApi", () => ({
  createProspectGame: vi.fn(),
  updateProspectGame: vi.fn(),
  deleteProspectGame: vi.fn(),
  invalidateBecomeProQueries: vi.fn().mockResolvedValue(undefined),
}));

function renderPanel(games: ProspectGame[] = [makeProspectGame()]) {
  return renderWithProviders(<SeasonEntryPanel season={makeProspectSeason()} games={games} />);
}

describe("SeasonEntryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createProspectGame).mockResolvedValue(makeProspectGame());
    vi.mocked(updateProspectGame).mockResolvedValue(makeProspectGame());
    vi.mocked(deleteProspectGame).mockResolvedValue({ deleted: true });
  });

  it("lists every logged game with its shooting splits", () => {
    renderPanel();

    expect(screen.getByText("Lincoln High")).toBeInTheDocument();
    expect(screen.getByText("9-17")).toBeInTheDocument();
    expect(screen.getByText("3-7")).toBeInTheDocument();
  });

  it("orders games most recent first", () => {
    renderPanel([
      makeProspectGame({ id: "old", gameDate: "2026-01-02T00:00:00.000Z", opponent: "Old Game" }),
      makeProspectGame({ id: "new", gameDate: "2026-02-02T00:00:00.000Z", opponent: "New Game" }),
    ]);

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("New Game");
    expect(rows[2]).toHaveTextContent("Old Game");
  });

  // The API sends a full timestamp; the table shows the date the user typed,
  // never a day shifted by their timezone.
  it("shows the logged date without a time", () => {
    renderPanel([makeProspectGame({ gameDate: "2026-01-15T00:00:00.000Z" })]);

    expect(screen.getByText("2026-01-15")).toBeInTheDocument();
  });

  it("renders a real table with column headers", () => {
    renderPanel();

    expect(screen.getByRole("columnheader", { name: "Opponent" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "PTS" })).toBeInTheDocument();
  });

  // The empty state explains the derivation rather than showing zeroes.
  it("explains that the season line comes from these rows", () => {
    renderPanel([]);

    expect(screen.getByText(/your season line is worked out from these rows/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("saves a new game against this season and refreshes the page", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText("Date"), "2026-02-10");
    await user.type(screen.getByLabelText("Opponent"), "Riverside");
    await user.click(screen.getByRole("button", { name: /add game/i }));

    expect(createProspectGame).toHaveBeenCalledWith("season-1", expect.objectContaining({ opponent: "Riverside" }));
    expect(invalidateBecomeProQueries).toHaveBeenCalled();
  });

  // The envelope already reads as a sentence, and it names which game clashed
  // — a generic message would throw that away.
  it("surfaces the API's own error message", async () => {
    vi.mocked(createProspectGame).mockRejectedValue(
      new ApiError("A game against Riverside on that date is already logged.", 409)
    );
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText("Date"), "2026-02-10");
    await user.type(screen.getByLabelText("Opponent"), "Riverside");
    await user.click(screen.getByRole("button", { name: /add game/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A game against Riverside on that date is already logged."
    );
  });

  it("falls back to a plain sentence when the failure is not the API's", async () => {
    vi.mocked(createProspectGame).mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText("Date"), "2026-02-10");
    await user.type(screen.getByLabelText("Opponent"), "Riverside");
    await user.click(screen.getByRole("button", { name: /add game/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save that game. Please try again.");
  });

  describe("correcting a game", () => {
    it("opens the game filled in, in place of the add form", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole("button", { name: /edit the game against Lincoln High on 2026-01-15/i }));

      // Only one form taking keystrokes, so Enter can only mean one thing.
      expect(screen.queryByRole("form", { name: "Add a game" })).not.toBeInTheDocument();
      const form = screen.getByRole("form", { name: "Edit the game against Lincoln High" });
      expect(within(form).getByLabelText("Date")).toHaveValue("2026-01-15");
      expect(within(form).getByLabelText("PTS")).toHaveValue(24);
    });

    it("saves the correction to that game", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole("button", { name: /edit the game against Lincoln High/i }));
      const points = screen.getByLabelText("PTS");
      await user.clear(points);
      await user.type(points, "27");
      await user.click(screen.getByRole("button", { name: /save changes/i }));

      expect(updateProspectGame).toHaveBeenCalledWith("game-1", expect.objectContaining({ points: 27 }));
      expect(await screen.findByRole("form", { name: "Add a game" })).toBeInTheDocument();
    });

    it("keeps the correction open with the API's message when it is refused", async () => {
      vi.mocked(updateProspectGame).mockRejectedValue(
        new ApiError("A game against Lincoln High on that date is already logged.", 409)
      );
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole("button", { name: /edit the game against Lincoln High/i }));
      await user.click(screen.getByRole("button", { name: /save changes/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent("already logged");
      expect(screen.getByRole("form", { name: "Edit the game against Lincoln High" })).toBeInTheDocument();
    });

    it("backs out without saving", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole("button", { name: /edit the game against Lincoln High/i }));
      await user.click(screen.getByRole("button", { name: /^cancel$/i }));

      expect(updateProspectGame).not.toHaveBeenCalled();
      expect(screen.getByRole("form", { name: "Add a game" })).toBeInTheDocument();
    });
  });

  describe("removing a game", () => {
    it("asks for confirmation first, because it can move the valuation", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole("button", { name: /remove the game against Lincoln High/i }));

      expect(deleteProspectGame).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
    });

    it("deletes once confirmed", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole("button", { name: /remove the game against Lincoln High/i }));
      await user.click(screen.getByRole("button", { name: /confirm/i }));

      expect(deleteProspectGame).toHaveBeenCalledWith("game-1");
    });

    it("backs out cleanly", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole("button", { name: /remove the game against Lincoln High/i }));
      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(deleteProspectGame).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /remove the game against/i })).toBeInTheDocument();
    });
  });

  it("has no accessibility violations", async () => {
    const { container } = renderPanel();

    await expectNoAccessibilityViolations(container);
  });
});
