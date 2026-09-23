import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import {
  makeProspectGame,
  makeProspectSeason,
} from "@/test/becomeProFixtures";
import { createProspectGame, deleteProspectGame } from "@/lib/becomeProApi";
import { ApiError } from "@/lib/apiClient";
import { SeasonEntryPanel } from "./SeasonEntryPanel";
import type { ProspectGame } from "@/types/nba";

vi.mock("@/lib/becomeProApi", () => ({
  createProspectGame: vi.fn(),
  deleteProspectGame: vi.fn(),
  invalidateProspectQueries: vi.fn().mockResolvedValue(undefined),
}));

function renderPanel(games: ProspectGame[] = [makeProspectGame()]) {
  return renderWithProviders(
    <SeasonEntryPanel season={makeProspectSeason()} games={games} username="kiran" />
  );
}

describe("SeasonEntryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createProspectGame).mockResolvedValue(makeProspectGame());
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
      makeProspectGame({ id: "old", gameDate: "2026-01-02", opponent: "Old Game" }),
      makeProspectGame({ id: "new", gameDate: "2026-02-02", opponent: "New Game" }),
    ]);

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("New Game");
    expect(rows[2]).toHaveTextContent("Old Game");
  });

  it("renders a real table with column headers", () => {
    renderPanel();

    expect(screen.getByRole("columnheader", { name: "Opponent" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "PTS" })).toBeInTheDocument();
  });

  it("shows each game's evidence standing in words", () => {
    renderPanel([makeProspectGame({ evidenceId: "e1", evidenceStatus: "VERIFIED" })]);

    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("says plainly when a game has nothing behind it", () => {
    renderPanel();

    expect(screen.getByText("None")).toBeInTheDocument();
  });

  // The empty state explains the derivation rather than showing zeroes.
  it("explains that the season line comes from these rows", () => {
    renderPanel([]);

    expect(screen.getByText(/your season line is derived from these rows/i)).toBeInTheDocument();
  });

  it("saves a new game against this season", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText("Date"), "2026-02-10");
    await user.type(screen.getByLabelText("Opponent"), "Riverside");
    await user.click(screen.getByRole("button", { name: /add game/i }));

    expect(createProspectGame).toHaveBeenCalledWith(
      "season-1",
      expect.objectContaining({ opponent: "Riverside" })
    );
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

  describe("removing a game", () => {
    it("asks for confirmation first, because it silently changes the valuation", async () => {
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
