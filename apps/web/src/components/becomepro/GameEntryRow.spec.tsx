import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { makeProspectGameInput } from "@/test/becomeProFixtures";
import { GameEntryRow } from "./GameEntryRow";

// Fills a complete, internally consistent row: 9-for-17 with 3 threes and
// 3 free throws is exactly 24 points.
async function fillValidGame(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Date"), "2026-01-15");
  await user.type(screen.getByLabelText("Opponent"), "Lincoln High");
  const entries: [string, string][] = [
    ["MIN", "32"],
    ["PTS", "24"],
    ["REB", "7"],
    ["AST", "5"],
    ["STL", "2"],
    ["BLK", "1"],
    ["TOV", "3"],
    ["FGM", "9"],
    ["FGA", "17"],
    ["3PM", "3"],
    ["3PA", "7"],
    ["FTM", "3"],
    ["FTA", "4"],
  ];
  for (const [label, value] of entries) {
    const input = screen.getByLabelText(label);
    await user.clear(input);
    await user.type(input, value);
  }
}

describe("GameEntryRow", () => {
  it("saves a complete row", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<GameEntryRow onSave={onSave} isSaving={false} />);

    await fillValidGame(user);
    await user.click(screen.getByRole("button", { name: /add game/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        gameDate: "2026-01-15",
        opponent: "Lincoln High",
        points: 24,
        fieldGoalsMade: 9,
        fieldGoalsAttempted: 17,
      })
    );
  });

  // Somebody back-filling a season enters twenty of these; re-typing the date
  // every time is the single biggest cost of doing it.
  it("carries the date forward and clears the rest after a save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<GameEntryRow onSave={onSave} isSaving={false} />);

    await fillValidGame(user);
    await user.click(screen.getByRole("button", { name: /add game/i }));

    expect(screen.getByLabelText("Date")).toHaveValue("2026-01-15");
    expect(screen.getByLabelText("Opponent")).toHaveValue("");
    expect(screen.getByLabelText("PTS")).toHaveValue(0);
  });

  it("returns focus to the first field so the next row can be typed straight away", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<GameEntryRow onSave={onSave} isSaving={false} />);

    await fillValidGame(user);
    await user.click(screen.getByRole("button", { name: /add game/i }));

    expect(screen.getByLabelText("Date")).toHaveFocus();
  });

  it("submits on Enter from inside a field", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<GameEntryRow onSave={onSave} isSaving={false} />);

    await fillValidGame(user);
    await user.type(screen.getByLabelText("PTS"), "{Enter}");

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("copies the previous game's line when asked", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <GameEntryRow
        onSave={vi.fn()}
        isSaving={false}
        lastGame={makeProspectGameInput({ opponent: "Riverside", points: 31 })}
      />
    );

    await user.click(screen.getByRole("button", { name: /copy last game/i }));

    expect(screen.getByLabelText("Opponent")).toHaveValue("Riverside");
    expect(screen.getByLabelText("PTS")).toHaveValue(31);
  });

  it("offers no copy button before there is a previous game", () => {
    renderWithProviders(<GameEntryRow onSave={vi.fn()} isSaving={false} />);

    expect(screen.queryByRole("button", { name: /copy last game/i })).not.toBeInTheDocument();
  });

  describe("validation", () => {
    // Arithmetic that cannot be true of any real game must never reach the API.
    it("refuses to save more makes than attempts", async () => {
      const onSave = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<GameEntryRow onSave={onSave} isSaving={false} />);

      await fillValidGame(user);
      const attempts = screen.getByLabelText("FGA");
      await user.clear(attempts);
      await user.type(attempts, "4");
      await user.click(screen.getByRole("button", { name: /add game/i }));

      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByText(/9 field goals made from 4 attempts/i)).toBeInTheDocument();
    });

    // A real scoresheet sometimes disagrees with its own splits, and refusing
    // the user's own sheet is worse than accepting it with a flag on it.
    it("saves a row whose points disagree with its shooting splits, but flags it", async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(<GameEntryRow onSave={onSave} isSaving={false} />);

      await fillValidGame(user);
      const points = screen.getByLabelText("PTS");
      await user.clear(points);
      await user.type(points, "22");
      await user.click(screen.getByRole("button", { name: /add game/i }));

      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("says nothing until a save is attempted", async () => {
      const user = userEvent.setup();
      renderWithProviders(<GameEntryRow onSave={vi.fn()} isSaving={false} />);

      await user.type(screen.getByLabelText("FGM"), "5");

      expect(screen.queryByText(/field goals made from/i)).not.toBeInTheDocument();
    });

    it("marks the offending input as invalid", async () => {
      const user = userEvent.setup();
      renderWithProviders(<GameEntryRow onSave={vi.fn()} isSaving={false} />);

      await fillValidGame(user);
      const minutes = screen.getByLabelText("MIN");
      await user.clear(minutes);
      await user.type(minutes, "320");
      await user.click(screen.getByRole("button", { name: /add game/i }));

      expect(screen.getByLabelText("MIN")).toHaveAttribute("aria-invalid", "true");
    });
  });

  it("surfaces a failed save from the API", () => {
    renderWithProviders(
      <GameEntryRow onSave={vi.fn()} isSaving={false} errorMessage="That game is already logged." />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("That game is already logged.");
  });

  it("disables the button while saving", () => {
    renderWithProviders(<GameEntryRow onSave={vi.fn()} isSaving />);

    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithProviders(<GameEntryRow onSave={vi.fn()} isSaving={false} />);

    await expectNoAccessibilityViolations(container);
  });
});
