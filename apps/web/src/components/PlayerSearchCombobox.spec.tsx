import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerSearchCombobox } from "./PlayerSearchCombobox";
import { useSession } from "@/lib/authClient";
import { fetchMe, fetchSuggestedPlayers } from "@/lib/meApi";
import { fetchPlayers } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { MeProfile, Player, Team } from "@/types/nba";

vi.mock("@/lib/nbaApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nbaApi")>();
  return { ...actual, fetchPlayers: vi.fn() };
});

vi.mock("@/lib/meApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meApi")>();
  return { ...actual, fetchMe: vi.fn(), fetchSuggestedPlayers: vi.fn() };
});

vi.mock("@/lib/authClient", () => ({
  useSession: vi.fn(),
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

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    nbaPlayerId: 1,
    firstName: "LeBron",
    lastName: "James",
    position: "F",
    heightInches: 81,
    weightLbs: 250,
    jerseyNumber: "23",
    headshotUrl: null,
    teamId: LAKERS.id,
    team: LAKERS,
    birthDate: null,
    school: null,
    country: null,
    lastAffiliation: null,
    seasonExp: null,
    rosterStatus: null,
    draftYear: null,
    draftRound: null,
    draftNumber: null,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<MeProfile> = {}): MeProfile {
  return {
    id: "user-1",
    email: "user@example.com",
    name: "Test User",
    username: "testuser",
    avatarUrl: null,
    favoriteTeam: null,
    followedPlayers: [],
    ...overrides,
  };
}

describe("PlayerSearchCombobox", () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);
    vi.mocked(fetchPlayers).mockResolvedValue({ data: [], page: 1, pageSize: 6, total: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not show suggestions on focus when suggestWhenEmpty is not set", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlayerSearchCombobox onSelect={vi.fn()} />);

    await user.click(screen.getByRole("searchbox"));

    expect(screen.queryByText("Top scorers")).not.toBeInTheDocument();
    expect(screen.queryByText("Your team")).not.toBeInTheDocument();
    expect(fetchSuggestedPlayers).not.toHaveBeenCalled();
  });

  it("suggests the league's top scorers on focus when signed out", async () => {
    vi.mocked(fetchPlayers).mockResolvedValue({
      data: [makePlayer({ id: "player-9", firstName: "Nikola", lastName: "Jokic" })],
      page: 1,
      pageSize: 6,
      total: 1,
    });
    const user = userEvent.setup();

    renderWithProviders(<PlayerSearchCombobox onSelect={vi.fn()} suggestWhenEmpty />);
    await user.click(screen.getByRole("searchbox"));

    expect(await screen.findByText("Top scorers")).toBeInTheDocument();
    expect(screen.getByText("Nikola Jokic")).toBeInTheDocument();
    expect(fetchPlayers).toHaveBeenCalledWith(expect.objectContaining({ sort: "ppg" }));
  });

  it("suggests the user's favourite team roster when signed in with a team chosen", async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: "user@example.com", name: "Test User" } },
      isPending: false,
    } as never);
    vi.mocked(fetchMe).mockResolvedValue(makeProfile({ favoriteTeam: LAKERS }));
    vi.mocked(fetchSuggestedPlayers).mockResolvedValue({
      players: [{ player: makePlayer(), usagePercentage: 31.2 }],
    });
    const user = userEvent.setup();

    renderWithProviders(<PlayerSearchCombobox onSelect={vi.fn()} suggestWhenEmpty />);
    await user.click(screen.getByRole("searchbox"));

    expect(await screen.findByText("Your team")).toBeInTheDocument();
    expect(screen.getByText("LeBron James")).toBeInTheDocument();
    expect(fetchSuggestedPlayers).toHaveBeenCalledWith(LAKERS.id, 6);
  });

  it("lists followed players under a Following heading, ahead of the favourite team roster", async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: "user@example.com", name: "Test User" } },
      isPending: false,
    } as never);
    const followed = makePlayer({ id: "player-followed", firstName: "Devin", lastName: "Booker" });
    const rosterPlayer = makePlayer({ id: "player-roster", firstName: "Anthony", lastName: "Davis" });
    vi.mocked(fetchMe).mockResolvedValue(makeProfile({ favoriteTeam: LAKERS, followedPlayers: [followed] }));
    vi.mocked(fetchSuggestedPlayers).mockResolvedValue({
      players: [{ player: rosterPlayer, usagePercentage: 28 }],
    });
    const user = userEvent.setup();

    renderWithProviders(<PlayerSearchCombobox onSelect={vi.fn()} suggestWhenEmpty />);
    await user.click(screen.getByRole("searchbox"));

    expect(await screen.findByText("Following")).toBeInTheDocument();
    expect(screen.getByText("Devin Booker")).toBeInTheDocument();
    expect(screen.getByText("Your team")).toBeInTheDocument();
    expect(screen.getByText("Anthony Davis")).toBeInTheDocument();

    // "Following" heading appears before "Your team" in document order.
    const headings = screen.getAllByText(/^(Following|Your team)$/);
    expect(headings.map((el) => el.textContent)).toEqual(["Following", "Your team"]);
  });

  it("does not repeat a followed player who is also on the favourite team roster", async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: "user@example.com", name: "Test User" } },
      isPending: false,
    } as never);
    const both = makePlayer({ id: "player-both", firstName: "Devin", lastName: "Booker" });
    vi.mocked(fetchMe).mockResolvedValue(makeProfile({ favoriteTeam: LAKERS, followedPlayers: [both] }));
    vi.mocked(fetchSuggestedPlayers).mockResolvedValue({ players: [{ player: both, usagePercentage: 28 }] });
    const user = userEvent.setup();

    renderWithProviders(<PlayerSearchCombobox onSelect={vi.fn()} suggestWhenEmpty />);
    await user.click(screen.getByRole("searchbox"));

    await screen.findByText("Following");
    expect(screen.getAllByText("Devin Booker")).toHaveLength(1);
    // The roster list had nothing left to show once the duplicate was
    // removed, so its own heading doesn't render.
    expect(screen.queryByText("Your team")).not.toBeInTheDocument();
  });

  it("shows followed players ahead of top scorers when the user has no favourite team", async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: "user@example.com", name: "Test User" } },
      isPending: false,
    } as never);
    const followed = makePlayer({ id: "player-followed", firstName: "Devin", lastName: "Booker" });
    vi.mocked(fetchMe).mockResolvedValue(makeProfile({ followedPlayers: [followed] }));
    vi.mocked(fetchPlayers).mockResolvedValue({
      data: [makePlayer({ id: "player-9", firstName: "Nikola", lastName: "Jokic" })],
      page: 1,
      pageSize: 6,
      total: 1,
    });
    const user = userEvent.setup();

    renderWithProviders(<PlayerSearchCombobox onSelect={vi.fn()} suggestWhenEmpty />);
    await user.click(screen.getByRole("searchbox"));

    expect(await screen.findByText("Following")).toBeInTheDocument();
    expect(screen.getByText("Devin Booker")).toBeInTheDocument();
    expect(screen.getByText("Top scorers")).toBeInTheDocument();
    expect(screen.getByText("Nikola Jokic")).toBeInTheDocument();
  });

  it("selects a suggested player and clears the search term", async () => {
    vi.mocked(fetchPlayers).mockResolvedValue({
      data: [makePlayer({ id: "player-9", firstName: "Nikola", lastName: "Jokic" })],
      page: 1,
      pageSize: 6,
      total: 1,
    });
    const onSelect = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<PlayerSearchCombobox onSelect={onSelect} suggestWhenEmpty />);
    await user.click(screen.getByRole("searchbox"));
    await user.click(await screen.findByRole("button", { name: /Nikola Jokic/ }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "player-9" }));
  });

  it("switches from suggestions to real search results once a query is typed", async () => {
    vi.mocked(fetchPlayers).mockImplementation((params) => {
      if (params?.search) {
        return Promise.resolve({
          data: [makePlayer({ id: "player-2", firstName: "Stephen", lastName: "Curry" })],
          page: 1,
          pageSize: 6,
          total: 1,
        });
      }
      return Promise.resolve({
        data: [makePlayer({ id: "player-9", firstName: "Nikola", lastName: "Jokic" })],
        page: 1,
        pageSize: 6,
        total: 1,
      });
    });
    const user = userEvent.setup();

    renderWithProviders(<PlayerSearchCombobox onSelect={vi.fn()} suggestWhenEmpty />);
    await user.click(screen.getByRole("searchbox"));
    expect(await screen.findByText("Nikola Jokic")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "curry");

    await waitFor(() => expect(screen.getByText("Stephen Curry")).toBeInTheDocument());
    expect(screen.queryByText("Nikola Jokic")).not.toBeInTheDocument();
  });
});
