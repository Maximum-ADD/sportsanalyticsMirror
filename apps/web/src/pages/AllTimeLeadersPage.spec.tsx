import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAllTimeLeaders, type AllTimeLeaderEntry, type AllTimeLeaderPlayer } from "@/lib/allTimeLeadersApi";
import { useSession } from "@/lib/authClient";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { renderWithProviders } from "@/test/renderWithProviders";
import { AllTimeLeadersPage } from "./AllTimeLeadersPage";

vi.mock("@/lib/allTimeLeadersApi", () => ({
  fetchAllTimeLeaders: vi.fn(),
}));

vi.mock("@/lib/authClient", () => ({
  useSession: vi.fn(),
}));

function makePlayer(overrides: Partial<AllTimeLeaderPlayer>): AllTimeLeaderPlayer {
  return {
    nbaPlayerId: 1,
    firstName: "First",
    lastName: "Last",
    position: null,
    heightInches: null,
    weightLbs: null,
    birthDate: null,
    school: null,
    country: null,
    fromYear: null,
    toYear: null,
    seasonExp: null,
    draftYear: null,
    draftRound: null,
    draftNumber: null,
    isGreatest75: false,
    isActive: false,
    playerId: null,
    ...overrides,
  };
}

const LEBRON: AllTimeLeaderEntry = {
  rank: 1,
  value: 43440,
  player: makePlayer({ nbaPlayerId: 2544, firstName: "LeBron", lastName: "James", isActive: true, playerId: "player-lebron" }),
};

const KAREEM: AllTimeLeaderEntry = {
  rank: 2,
  value: 38387,
  player: makePlayer({
    nbaPlayerId: 76003,
    firstName: "Kareem",
    lastName: "Abdul-Jabbar",
    position: "Center",
    heightInches: 86,
    birthDate: "1947-04-16T00:00:00.000Z",
    school: "UCLA",
    country: "USA",
    fromYear: 1969,
    toYear: 1988,
    seasonExp: 20,
    draftYear: 1969,
    draftRound: 1,
    draftNumber: 1,
    isGreatest75: true,
  }),
};

function mockLeaderboard(leaders: AllTimeLeaderEntry[]) {
  vi.mocked(fetchAllTimeLeaders).mockImplementation(async (category, seasonType) => ({
    category,
    seasonType,
    fetchedAt: "2026-10-09T12:00:00.000Z",
    leaders,
  }));
}

describe("AllTimeLeadersPage", () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("opens on regular-season points with the leader's bio and a link to their profile", async () => {
    mockLeaderboard([LEBRON, KAREEM]);

    renderWithProviders(<AllTimeLeadersPage />);

    const bio = await screen.findByRole("region", { name: "LeBron James bio" });
    expect(fetchAllTimeLeaders).toHaveBeenCalledWith("POINTS", "REGULAR");
    expect(within(bio).getByText("43,440")).toBeInTheDocument();
    expect(within(bio).getByRole("link", { name: "Open player profile" })).toHaveAttribute("href", "/players/player-lebron");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows a chosen player's bio, without a profile link when the app doesn't hold them", async () => {
    mockLeaderboard([LEBRON, KAREEM]);
    const user = userEvent.setup();
    renderWithProviders(<AllTimeLeadersPage />);
    await screen.findByRole("region", { name: "LeBron James bio" });

    await user.click(screen.getByRole("button", { name: "2. Kareem Abdul-Jabbar, 38,387" }));

    const bio = screen.getByRole("region", { name: "Kareem Abdul-Jabbar bio" });
    expect(within(bio).getByText("7'2\"")).toBeInTheDocument();
    expect(within(bio).getByText("16 April 1947")).toBeInTheDocument();
    expect(within(bio).getByText("1969 · Round 1, Pick 1")).toBeInTheDocument();
    expect(within(bio).getByText("1969-70 to 1988-89 (20 seasons)")).toBeInTheDocument();
    expect(within(bio).getByText("NBA 75th Anniversary Team")).toBeInTheDocument();
    expect(within(bio).queryByRole("link", { name: "Open player profile" })).not.toBeInTheDocument();
  });

  it("loads the chosen category and season type, and notes when a category's records start late", async () => {
    mockLeaderboard([KAREEM]);
    const user = userEvent.setup();
    renderWithProviders(<AllTimeLeadersPage />);
    await screen.findByRole("region", { name: "Kareem Abdul-Jabbar bio" });

    await user.click(within(screen.getByRole("group", { name: "Category" })).getByRole("button", { name: "Blocks" }));
    await user.click(within(screen.getByRole("group", { name: "Season type" })).getByRole("button", { name: "Playoffs" }));

    await waitFor(() => expect(fetchAllTimeLeaders).toHaveBeenLastCalledWith("BLOCKS", "PLAYOFFS"));
    expect(screen.getByText(/only recorded blocks since 1973-74/)).toBeInTheDocument();
  });

  it("says so when no leaders have been loaded", async () => {
    mockLeaderboard([]);

    renderWithProviders(<AllTimeLeadersPage />);

    expect(await screen.findByText("No all-time leaders have been loaded yet.")).toBeInTheDocument();
  });

  it("shows an error state when the leaders can't be loaded", async () => {
    vi.mocked(fetchAllTimeLeaders).mockRejectedValue(new Error("fail"));

    renderWithProviders(<AllTimeLeadersPage />);

    expect(await screen.findByText("Could not load the all-time leaders.")).toBeInTheDocument();
  });

  it("offers a ? button that replays the page tutorial, with no accessibility violations", async () => {
    mockLeaderboard([LEBRON, KAREEM]);
    const user = userEvent.setup();
    const { container } = renderWithProviders(<main><AllTimeLeadersPage /></main>);
    await screen.findByRole("region", { name: "LeBron James bio" });

    await expectNoAccessibilityViolations(container);
    await user.click(screen.getByRole("button", { name: "Show the all-time leaders page tutorial" }));

    const dialog = screen.getByRole("dialog", { name: "Page tutorial · all-time leaders" });
    expect(within(dialog).getByRole("heading", { name: "Welcome to all-time leaders" })).toBeInTheDocument();
  });
});
