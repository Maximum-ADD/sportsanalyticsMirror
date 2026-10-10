import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingPage } from "./OnboardingPage";
import { useSession } from "@/lib/authClient";
import { fetchMe, updateMe, followPlayer, unfollowPlayer, fetchSuggestedPlayers, markTutorialSeen } from "@/lib/meApi";
import { fetchTeams } from "@/lib/nbaApi";
import { ApiError } from "@/lib/apiClient";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import type { MeProfile, Player, SuggestedPlayer, Team } from "@/types/nba";

vi.mock("@/lib/authClient", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/meApi", () => ({
  fetchMe: vi.fn(),
  updateMe: vi.fn(),
  followPlayer: vi.fn(),
  unfollowPlayer: vi.fn(),
  fetchSuggestedPlayers: vi.fn(),
  // The page tutorial's writes — see the "?" button tests below.
  markTutorialSeen: vi.fn(),
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

  // NOT_ONBOARDED_ME carries no seenTutorialIds, so the tutorial never opens
  // by itself here (usePageTutorial's own spec covers that); the "?" button
  // needs none.
  it("offers a ? button that replays the onboarding page tutorial over the page", async () => {
    setUpSignedInNotOnboarded();
    const user = userEvent.setup();
    const { container } = renderWithProviders(<main><OnboardingPage /></main>);
    await screen.findByRole("heading", { name: "Choose a username" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show the onboarding page tutorial" }));

    const dialog = screen.getByRole("dialog", { name: "Page tutorial · onboarding" });
    expect(within(dialog).getByRole("heading", { name: "Welcome — let's set you up" })).toBeInTheDocument();
    // The tutorial opens over the page — run axe over the open dialog too.
    await expectNoAccessibilityViolations(container);
  });

  // Regression: closing a tutorial the account hasn't recorded refetches
  // GET /v1/me, which after step 1 carries the new username — and the
  // "already onboarded" redirect used to read that as a reason to bounce
  // to /home before the team and players steps.
  it("stays on the team step when the tutorial is closed after the username is saved", async () => {
    setUpSignedInNotOnboarded();
    vi.mocked(fetchMe).mockResolvedValue({ ...NOT_ONBOARDED_ME, seenTutorialIds: [], autoOpenTutorials: false });
    vi.mocked(updateMe).mockResolvedValue(NOT_ONBOARDED_ME);
    vi.mocked(markTutorialSeen).mockResolvedValue({ seen: true });
    const user = userEvent.setup();
    // Real routes, so a bounce to /home lands somewhere visible rather than
    // re-rendering this page into the same redirect forever.
    renderWithProviders(
      <Routes>
        <Route path="/" element={<OnboardingPage />} />
        <Route path="/home" element={<p>Home page</p>} />
      </Routes>
    );

    await user.type(await screen.findByLabelText("Username"), "hoopsfan");
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    vi.mocked(fetchMe).mockResolvedValue({
      ...NOT_ONBOARDED_ME,
      username: "hoopsfan",
      seenTutorialIds: [],
      autoOpenTutorials: false,
    });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Pick your team" })).toBeInTheDocument();

    const fetchCountBeforeClose = vi.mocked(fetchMe).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Show the onboarding page tutorial" }));
    await user.click(screen.getByRole("button", { name: "Skip this tutorial" }));

    await waitFor(() => expect(vi.mocked(fetchMe).mock.calls.length).toBeGreaterThan(fetchCountBeforeClose));
    expect(markTutorialSeen).toHaveBeenCalledWith("onboarding");
    // Let the refetched profile land and re-render before checking.
    await waitFor(() => expect(vi.mocked(fetchMe).mock.results.at(-1)?.type).toBe("return"));
    await act(async () => {});
    expect(screen.queryByText("Home page")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pick your team" })).toBeInTheDocument();
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

  it("persists deselection, preserves selection on failure, and blocks Finish while saving", async () => {
    setUpSignedInNotOnboarded();
    vi.mocked(updateMe).mockResolvedValue(NOT_ONBOARDED_ME);
    vi.mocked(fetchSuggestedPlayers).mockResolvedValue({ players: [{ player: makePlayer(), usagePercentage: 31.5 }] });
    let completeFollow!: (value: { following: true }) => void;
    vi.mocked(followPlayer).mockImplementation(() => new Promise((resolve) => { completeFollow = resolve; }));
    const user = userEvent.setup();
    renderWithProviders(<OnboardingPage />);
    await user.type(await screen.findByLabelText("Username"), "hoopsfan");
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("radio", { name: /Los Angeles/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const player = await screen.findByRole("button", { name: /LeBron James/ });
    await user.click(player);
    expect(player).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Skip" })).toBeDisabled();
    completeFollow({ following: true });
    await waitFor(() => expect(player).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(player).toBeEnabled());
    let rejectUnfollow!: (error: Error) => void;
    vi.mocked(unfollowPlayer).mockImplementationOnce(() => new Promise((_, reject) => { rejectUnfollow = reject; }));
    await user.click(player);
    expect(screen.getByRole("button", { name: "Finish" })).toBeDisabled();
    rejectUnfollow(new Error("offline"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
    expect(player).toHaveAttribute("aria-pressed", "true");
    vi.mocked(unfollowPlayer).mockResolvedValue({ following: false });
    await user.click(player);
    await waitFor(() => expect(player).toHaveAttribute("aria-pressed", "false"));
    expect(unfollowPlayer).toHaveBeenCalledWith("player-1");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    vi.mocked(followPlayer).mockRejectedValueOnce(new Error("offline"));
    await waitFor(() => expect(player).toBeEnabled());
    await user.click(player);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
    expect(player).toHaveAttribute("aria-pressed", "false");
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
