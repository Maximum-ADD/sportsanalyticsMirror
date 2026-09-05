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
  render(
    <PlayersFilterBar
      teams={TEAMS}
      searchTerm=""
      teamId={undefined}
      position={undefined}
      sortKey="name"
      onSearchChange={vi.fn()}
      onTeamChange={onTeamChange}
      onPositionChange={onPositionChange}
      onSortChange={onSortChange}
      {...overrides}
    />
  );
  return { onTeamChange, onPositionChange, onSortChange };
}

describe("PlayersFilterBar", () => {
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
});
