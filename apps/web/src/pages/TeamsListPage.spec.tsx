import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTeams } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Team } from "@/types/nba";
import { TeamsListPage } from "./TeamsListPage";

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

describe("TeamsListPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders teams once the query resolves", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 12, total: 1 });

    renderWithProviders(<TeamsListPage />);

    expect(await screen.findByText("Los Angeles Lakers")).toBeInTheDocument();
    expect(screen.getByText("LAL")).toBeInTheDocument();
  });

  it("debounces team search and resets pagination to page one", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 12, total: 24 });
    const user = userEvent.setup();

    renderWithProviders(<TeamsListPage />);
    await screen.findByText("Los Angeles Lakers");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetchTeams).toHaveBeenLastCalledWith({ page: 2, pageSize: 12, search: undefined }));

    await user.type(screen.getByRole("searchbox", { name: "Search teams" }), "  lal  ");

    await waitFor(() => expect(fetchTeams).toHaveBeenLastCalledWith({ page: 1, pageSize: 12, search: "lal" }));
  });

  it("shows a clear message when no teams match", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [], page: 1, pageSize: 12, total: 0 });

    renderWithProviders(<TeamsListPage />);

    expect(await screen.findByText("No teams found.")).toBeInTheDocument();
  });
});
