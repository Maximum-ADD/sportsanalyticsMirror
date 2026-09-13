import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamPicker } from "./TeamPicker";
import { fetchTeams } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Team } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchTeams: vi.fn(),
}));

const LAKERS: Team = {
  id: "team-1",
  nbaTeamId: 1,
  name: "Lakers",
  abbreviation: "LAL",
  city: "Los Angeles",
  conference: "West",
  division: "Pacific",
  logoUrl: null,
};

const CELTICS: Team = {
  id: "team-2",
  nbaTeamId: 2,
  name: "Celtics",
  abbreviation: "BOS",
  city: "Boston",
  conference: "East",
  division: "Atlantic",
  logoUrl: null,
};

describe("TeamPicker", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state before teams resolve", () => {
    vi.mocked(fetchTeams).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<TeamPicker selectedTeamId={null} onSelect={vi.fn()} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders every team as a radio option", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS, CELTICS], page: 1, pageSize: 30, total: 2 });

    renderWithProviders(<TeamPicker selectedTeamId={null} onSelect={vi.fn()} />);

    expect(await screen.findAllByRole("radio")).toHaveLength(2);
    expect(screen.getByText("Los Angeles")).toBeInTheDocument();
    expect(screen.getByText("Boston")).toBeInTheDocument();
  });

  it("marks the selected team as checked", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS, CELTICS], page: 1, pageSize: 30, total: 2 });

    renderWithProviders(<TeamPicker selectedTeamId={LAKERS.id} onSelect={vi.fn()} />);
    await screen.findAllByRole("radio");

    expect(screen.getByRole("radio", { name: /Los Angeles/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Boston/ })).toHaveAttribute("aria-checked", "false");
  });

  it("calls onSelect with the clicked team", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS, CELTICS], page: 1, pageSize: 30, total: 2 });
    const onSelect = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<TeamPicker selectedTeamId={null} onSelect={onSelect} />);
    await user.click(await screen.findByRole("radio", { name: /Boston/ }));

    expect(onSelect).toHaveBeenCalledWith(CELTICS);
  });
});
