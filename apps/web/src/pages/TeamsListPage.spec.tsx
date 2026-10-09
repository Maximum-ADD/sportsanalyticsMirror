import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEloRatings, fetchTeamRecords, fetchTeams } from "@/lib/nbaApi";
import { useSession } from "@/lib/authClient";
import { fetchMe } from "@/lib/meApi";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { MeProfile, Team } from "@/types/nba";
import { TeamsListPage } from "./TeamsListPage";

vi.mock("@/lib/nbaApi", () => ({
  fetchTeams: vi.fn(),
  fetchEloRatings: vi.fn(),
  fetchTeamRecords: vi.fn(),
}));

vi.mock("@/lib/authClient", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/meApi", () => ({
  fetchMe: vi.fn(),
  updateMe: vi.fn(),
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

describe("TeamsListPage", () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);
    vi.mocked(fetchEloRatings).mockResolvedValue([]);
    vi.mocked(fetchTeamRecords).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders teams once the queries resolve", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 30, total: 1 });

    renderWithProviders(<TeamsListPage />);

    expect(await screen.findByText("Los Angeles Lakers")).toBeInTheDocument();
    expect(screen.getByText("West · Pacific")).toBeInTheDocument();
  });

  it("filters teams by search term", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS, CELTICS], page: 1, pageSize: 30, total: 2 });
    const user = userEvent.setup();

    renderWithProviders(<TeamsListPage />);
    await screen.findByText("Los Angeles Lakers");

    await user.type(screen.getByRole("searchbox", { name: "Search teams" }), "celt");

    await waitFor(() => expect(screen.queryByText("Los Angeles Lakers")).not.toBeInTheDocument());
    expect(screen.getByText("Boston Celtics")).toBeInTheDocument();
  });

  it("filters teams by conference", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS, CELTICS], page: 1, pageSize: 30, total: 2 });
    const user = userEvent.setup();

    renderWithProviders(<TeamsListPage />);
    await screen.findByText("Los Angeles Lakers");

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter teams by conference" }), "East");

    await waitFor(() => expect(screen.queryByText("Los Angeles Lakers")).not.toBeInTheDocument());
    expect(screen.getByText("Boston Celtics")).toBeInTheDocument();
  });

  it("shows each team's Elo rating and record", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 30, total: 1 });
    vi.mocked(fetchEloRatings).mockResolvedValue([
      { team: LAKERS, elo: 1587, asOfGameId: "g1", asOfGameDate: "2026-01-01" },
    ]);
    vi.mocked(fetchTeamRecords).mockResolvedValue([
      { teamId: LAKERS.id, wins: 10, losses: 5, winPercentage: 0.667, recentForm: ["W", "L", "W", "W", "W"] },
    ]);

    renderWithProviders(<TeamsListPage />);

    expect(await screen.findByText("1587")).toBeInTheDocument();
    expect(screen.getByText("10–5")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  function signInFollowing(favoriteTeam: Team) {
    vi.mocked(useSession).mockReturnValue({ data: { user: { id: "user-1" } }, isPending: false } as never);
    vi.mocked(fetchMe).mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "Test User",
      username: "testuser",
      avatarUrl: null,
      favoriteTeam,
      followedPlayers: [],
      role: "USER",
    } satisfies MeProfile);
  }

  it("shows the user's own team in a card above the list, leaving the list's sort alone", async () => {
    signInFollowing(CELTICS);
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS, CELTICS], page: 1, pageSize: 30, total: 2 });
    vi.mocked(fetchEloRatings).mockResolvedValue([
      { team: LAKERS, elo: 1600, asOfGameId: "g1", asOfGameDate: "2026-01-01" },
      { team: CELTICS, elo: 1400, asOfGameId: "g2", asOfGameDate: "2026-01-01" },
    ]);

    renderWithProviders(<TeamsListPage />);

    const yourTeam = await screen.findByRole("region", { name: "Your team" });
    expect(within(yourTeam).getByText("Boston Celtics")).toBeInTheDocument();
    // The card plus the Celtics' own place in the list, still below the
    // higher-rated Lakers.
    const cardNames = screen.getAllByText(/^(Los Angeles Lakers|Boston Celtics)$/).map((name) => name.textContent);
    expect(cardNames).toEqual(["Boston Celtics", "Los Angeles Lakers", "Boston Celtics"]);
  });

  it("hides the Your team card while a filter narrows the list", async () => {
    signInFollowing(CELTICS);
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS, CELTICS], page: 1, pageSize: 30, total: 2 });
    const user = userEvent.setup();

    renderWithProviders(<TeamsListPage />);
    await screen.findByRole("region", { name: "Your team" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter teams by conference" }), "East");

    await waitFor(() => expect(screen.queryByRole("region", { name: "Your team" })).not.toBeInTheDocument());
    expect(screen.getByText("Boston Celtics")).toBeInTheDocument();
  });

  it("shows a clear message when no teams match", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [], page: 1, pageSize: 30, total: 0 });

    renderWithProviders(<TeamsListPage />);

    expect(await screen.findByText("No teams found.")).toBeInTheDocument();
  });

  // Signed out here, so there is no profile to open the tutorial by itself
  // (usePageTutorial's own spec covers that); the "?" button needs none.
  it("offers a ? button that replays the teams page tutorial over the page", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 30, total: 1 });
    const user = userEvent.setup();
    const { container } = renderWithProviders(<main><TeamsListPage /></main>);
    await screen.findByRole("button", { name: "Show the teams page tutorial" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show the teams page tutorial" }));

    const dialog = screen.getByRole("dialog", { name: "Page tutorial · teams" });
    expect(within(dialog).getByRole("heading", { name: "Welcome to Teams" })).toBeInTheDocument();
    // The tutorial opens over the page — run axe over the open dialog too.
    await expectNoAccessibilityViolations(container);
  });
});
