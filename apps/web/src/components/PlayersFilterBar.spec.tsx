import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlayersFilterBar } from "./PlayersFilterBar";
import type { Team } from "@/types/nba";

const TEAMS: Team[] = [
  {
    id: "team-1",
    nbaTeamId: 1,
    name: "Lakers",
    abbreviation: "LAL",
    city: "Los Angeles",
    conference: "West",
    division: "Pacific",
    logoUrl: null,
  },
];

function renderFilterBar(overrides: Partial<ComponentProps<typeof PlayersFilterBar>> = {}) {
  const onTeamChange = vi.fn();
  const onPositionChange = vi.fn();
  const onSortChange = vi.fn();
  const onSortOrderChange = vi.fn();
  const onMinGamesChange = vi.fn();
  render(
    <PlayersFilterBar
      teams={TEAMS}
      searchTerm=""
      teamId={undefined}
      position={undefined}
      sortKey="name"
      minGames={undefined}
      onSearchChange={vi.fn()}
      onTeamChange={onTeamChange}
      onPositionChange={onPositionChange}
      onSortChange={onSortChange}
      onMinGamesChange={onMinGamesChange}
      sortOrder="desc"
      onSortOrderChange={onSortOrderChange}
      {...overrides}
    />
  );
  return { onTeamChange, onPositionChange, onSortChange, onSortOrderChange, onMinGamesChange };
}

describe("PlayersFilterBar", () => {
  it("gives every filter an accessible name", () => {
    renderFilterBar();

    expect(screen.getByRole("searchbox", { name: "Search players" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter players by team" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter players by position" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sort players" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter players by minimum games" })).toBeInTheDocument();
  });

  it("reports player search input changes", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderFilterBar({ onSearchChange });

    await user.type(screen.getByRole("searchbox", { name: "Search players" }), "L");

    expect(onSearchChange).toHaveBeenCalledWith("L");
  });

  it("lists each team by city + name in the team select", () => {
    renderFilterBar();
    expect(screen.getByRole("option", { name: "Los Angeles Lakers" })).toBeInTheDocument();
  });

  it("calls onTeamChange with the selected team id", async () => {
    const user = userEvent.setup();
    const { onTeamChange } = renderFilterBar();

    await user.selectOptions(screen.getByDisplayValue("All teams"), "team-1");

    expect(onTeamChange).toHaveBeenCalledWith("team-1");
  });

  it("calls onTeamChange with undefined when switching back to 'All teams'", async () => {
    const user = userEvent.setup();
    const { onTeamChange } = renderFilterBar({ teamId: "team-1" });

    await user.selectOptions(screen.getByDisplayValue("Los Angeles Lakers"), "");

    expect(onTeamChange).toHaveBeenCalledWith(undefined);
  });

  it("calls onPositionChange with the selected position", async () => {
    const user = userEvent.setup();
    const { onPositionChange } = renderFilterBar();

    await user.selectOptions(screen.getByDisplayValue("All positions"), "C");

    expect(onPositionChange).toHaveBeenCalledWith("C");
  });

  it("calls onSortChange with the selected sort key", async () => {
    const user = userEvent.setup();
    const { onSortChange } = renderFilterBar();

    await user.selectOptions(screen.getByDisplayValue("Sort: Name"), "ppg");

    expect(onSortChange).toHaveBeenCalledWith("ppg");
  });

  it("offers every season stat the ranked listing can sort by", () => {
    renderFilterBar();

    const sortSelect = screen.getByRole("combobox", { name: "Sort players" });
    for (const optionLabel of [
      "Sort: Points per game",
      "Sort: Rebounds per game",
      "Sort: Assists per game",
      "Sort: True shooting",
    ]) {
      expect(screen.getByRole("option", { name: optionLabel })).toBeInTheDocument();
    }
    expect(sortSelect).toBeInTheDocument();
  });

  it("calls onSortOrderChange with the selected direction", async () => {
    const user = userEvent.setup();
    const { onSortOrderChange } = renderFilterBar();

    await user.selectOptions(screen.getByDisplayValue("Order: High to low"), "asc");

    expect(onSortOrderChange).toHaveBeenCalledWith("asc");
  });

  it("calls onMinGamesChange with a number when a floor is picked", async () => {
    const user = userEvent.setup();
    const { onMinGamesChange } = renderFilterBar();

    await user.selectOptions(screen.getByDisplayValue("Min. games: Any"), "15");

    expect(onMinGamesChange).toHaveBeenCalledWith(15);
  });

  it("calls onMinGamesChange with undefined when switching back to 'Any'", async () => {
    const user = userEvent.setup();
    const { onMinGamesChange } = renderFilterBar({ minGames: 15 });

    await user.selectOptions(screen.getByDisplayValue("Min. games: 15"), "");

    expect(onMinGamesChange).toHaveBeenCalledWith(undefined);
  });

  describe("followed-only toggle", () => {
    it("does not render the toggle by default", () => {
      renderFilterBar();

      expect(screen.queryByRole("button", { name: "Show followed players only" })).not.toBeInTheDocument();
    });

    it("shows the followed count on the chip when enabled", () => {
      renderFilterBar({ showFollowingFilter: true, followedCount: 3 });

      const toggle = screen.getByRole("button", { name: "Show followed players only" });
      expect(toggle).toHaveTextContent("Following · 3");
      expect(toggle).toHaveAttribute("aria-pressed", "false");
    });

    it("marks the chip pressed and reports the new value when clicked", async () => {
      const user = userEvent.setup();
      const onFollowedOnlyChange = vi.fn();
      renderFilterBar({ showFollowingFilter: true, followedCount: 3, followedOnly: true, onFollowedOnlyChange });

      const toggle = screen.getByRole("button", { name: "Show followed players only" });
      expect(toggle).toHaveAttribute("aria-pressed", "true");

      await user.click(toggle);

      expect(onFollowedOnlyChange).toHaveBeenCalledWith(false);
    });
  });
});
