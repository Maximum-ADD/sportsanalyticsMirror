import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingPage } from "./OnboardingPage";
import { useSession } from "@/lib/authClient";
import { fetchMe, updateMe, followPlayer, fetchSuggestedPlayers } from "@/lib/meApi";
import { fetchTeams } from "@/lib/nbaApi";
import { ApiError } from "@/lib/apiClient";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { MeProfile, Player, SuggestedPlayer, Team } from "@/types/nba";

vi.mock("@/lib/authClient", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/meApi", () => ({
  fetchMe: vi.fn(),
  updateMe: vi.fn(),
  followPlayer: vi.fn(),
  fetchSuggestedPlayers: vi.fn(),
}));

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

const NOT_ONBOARDED_ME: MeProfile = {
  id: "user-1",
  email: "player@example.com",
  name: "Player One",
  username: null,
  avatarUrl: null,
  favoriteTeam: null,
  followedPlayers: [],
  role: "USER",
};

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    nbaPlayerId: 1,
    firstName: "LeBron",
    lastName: "James",
    position: "F",
    heightInches: null,
    weightLbs: null,
    jerseyNumber: null,
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

describe("OnboardingPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function setUpSignedInNotOnboarded() {
    vi.mocked(useSession).mockReturnValue({ data: { user: {} }, isPending: false } as never);
    vi.mocked(fetchMe).mockResolvedValue(NOT_ONBOARDED_ME);
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 30, total: 1 });
  }

  it("starts on the username step", async () => {
    setUpSignedInNotOnboarded();

    renderWithProviders(<OnboardingPage />);

    expect(await screen.findByRole("heading", { name: "Choose a username" })).toBeInTheDocument();
  });

  it("rejects an invalid username format before ever calling the API", async () => {
    setUpSignedInNotOnboarded();
    const user = userEvent.setup();

    renderWithProviders(<OnboardingPage />);
    const input = await screen.findByLabelText("Username");
    await user.type(input, "a");

    await waitFor(() => {
      expect(screen.getByText(/3-20 characters/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("shows an inline error when the username is already taken", async () => {
    setUpSignedInNotOnboarded();
    vi.mocked(updateMe).mockRejectedValue(new ApiError("Conflict", 409));
    const user = userEvent.setup();

    renderWithProviders(<OnboardingPage />);
    const input = await screen.findByLabelText("Username");
    await user.type(input, "takenname");
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("That username is already taken.")).toBeInTheDocument();
  });

  it("advances through username -> team -> players and finishes", async () => {
    setUpSignedInNotOnboarded();
    vi.mocked(updateMe).mockResolvedValue(NOT_ONBOARDED_ME);
    const suggested: SuggestedPlayer[] = [{ player: makePlayer(), usagePercentage: 31.5 }];
    vi.mocked(fetchSuggestedPlayers).mockResolvedValue({ players: suggested });
    vi.mocked(followPlayer).mockResolvedValue({ following: true });
    const user = userEvent.setup();

    renderWithProviders(<OnboardingPage />);

    // Step 1: username
    const usernameInput = await screen.findByLabelText("Username");
    await user.type(usernameInput, "hoopsfan");
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(updateMe).toHaveBeenCalledWith({ username: "hoopsfan" });

    // Step 2: team
    expect(await screen.findByRole("heading", { name: "Pick your team" })).toBeInTheDocument();
    await user.click(await screen.findByRole("radio", { name: /Los Angeles/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(updateMe).toHaveBeenCalledWith({ favoriteTeamId: LAKERS.id });

    // Step 3: suggested players
    expect(await screen.findByRole("heading", { name: "Follow a few players" })).toBeInTheDocument();
    expect(await screen.findByText("LeBron James")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /LeBron James/ }));
    expect(followPlayer).toHaveBeenCalledWith("player-1");

    await user.click(screen.getByRole("button", { name: "Finish" }));
  });

  it("lets the players step be skipped without following anyone", async () => {
    setUpSignedInNotOnboarded();
    vi.mocked(updateMe).mockResolvedValue(NOT_ONBOARDED_ME);
    vi.mocked(fetchSuggestedPlayers).mockResolvedValue({ players: [] });
    const user = userEvent.setup();

    renderWithProviders(<OnboardingPage />);

    const usernameInput = await screen.findByLabelText("Username");
    await user.type(usernameInput, "hoopsfan");
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.click(await screen.findByRole("radio", { name: /Los Angeles/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("button", { name: "Skip" })).toBeInTheDocument();
  });
});
