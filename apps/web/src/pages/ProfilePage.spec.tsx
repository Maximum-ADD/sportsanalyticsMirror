import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfilePage } from "./ProfilePage";
import { authClient, useSession } from "@/lib/authClient";
import { deleteSavedLineup, fetchMe, fetchSavedLineups, updateMe, uploadAvatar, unfollowPlayer } from "@/lib/meApi";
import { fetchTeams } from "@/lib/nbaApi";
import { ApiError } from "@/lib/apiClient";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { MeProfile, Player, SavedLineup, Team } from "@/types/nba";

vi.mock("@/lib/authClient", () => ({
  authClient: { signOut: vi.fn(), deleteUser: vi.fn() },
  useSession: vi.fn(),
}));

vi.mock("@/lib/meApi", () => ({
  fetchMe: vi.fn(),
  updateMe: vi.fn(),
  uploadAvatar: vi.fn(),
  unfollowPlayer: vi.fn(),
  followPlayer: vi.fn(),
  fetchSavedLineups: vi.fn(),
  deleteSavedLineup: vi.fn(),
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

const ME: MeProfile = {
  id: "user-1",
  email: "player@example.com",
  name: "Player One",
  username: "playerone",
  avatarUrl: null,
  favoriteTeam: LAKERS,
  followedPlayers: [makePlayer()],
};

function makeSavedLineup(overrides: Partial<SavedLineup> = {}): SavedLineup {
  return {
    id: "saved-1",
    budget: 50_000,
    name: "Week 3 flyers",
    createdAt: "2026-09-12T08:00:00.000Z",
    totalPredictedPointsAtSave: 81.8,
    totalSalaryAtSave: 18_200,
    drift: null,
    slots: [
      {
        id: "saved-slot-1",
        playerId: "player-1",
        player: makePlayer(),
        predictedPointsAtSave: 43.3,
        salaryAtSave: 9_900,
        currentPredictedFantasyPoints: 45.1,
        currentSalary: 10_400,
      },
      {
        id: "saved-slot-2",
        playerId: "player-2",
        player: makePlayer({ id: "player-2", nbaPlayerId: 2, firstName: "Anthony", lastName: "Davis", position: "F-C" }),
        predictedPointsAtSave: 38.5,
        salaryAtSave: 8_300,
        currentPredictedFantasyPoints: 41.3,
        currentSalary: 9_700,
      },
    ],
    ...overrides,
  };
}

describe("ProfilePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function setUp(me: MeProfile = ME) {
    vi.mocked(useSession).mockReturnValue({ data: { user: {} }, isPending: false } as never);
    vi.mocked(fetchMe).mockResolvedValue(me);
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS, CELTICS], page: 1, pageSize: 30, total: 2 });
    vi.mocked(fetchSavedLineups).mockResolvedValue([]);
  }

  it("shows a loading state before the profile resolves", () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: {} }, isPending: false } as never);
    vi.mocked(fetchMe).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<ProfilePage />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders the current username, favorite team, and followed players", async () => {
    setUp();

    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText("playerone")).toBeInTheDocument();
    expect(screen.getByText("Los Angeles Lakers")).toBeInTheDocument();
    expect(screen.getByText("LeBron James")).toBeInTheDocument();
  });

  it("shows an empty state when nothing is followed yet", async () => {
    setUp({ ...ME, followedPlayers: [] });

    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText("You're not following any players yet.")).toBeInTheDocument();
  });

  it("unfollows a player when its remove button is clicked", async () => {
    setUp();
    vi.mocked(unfollowPlayer).mockResolvedValue({ following: false });
    const user = userEvent.setup();

    renderWithProviders(<ProfilePage />);
    await screen.findByText("LeBron James");
    await user.click(screen.getByRole("button", { name: "Unfollow LeBron James" }));

    expect(unfollowPlayer).toHaveBeenCalledWith("player-1");
  });

  it("edits the username", async () => {
    setUp();
    vi.mocked(updateMe).mockResolvedValue({ ...ME, username: "newname" });
    const user = userEvent.setup();

    renderWithProviders(<ProfilePage />);
    await screen.findByText("playerone");
    await user.click(screen.getByRole("button", { name: "Change username" }));

    const input = screen.getByDisplayValue("playerone");
    await user.clear(input);
    await user.type(input, "newname");
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMe).toHaveBeenCalledWith({ username: "newname" });
  });

  it("shows a conflict error when the new username is already taken", async () => {
    setUp();
    vi.mocked(updateMe).mockRejectedValue(new ApiError("Conflict", 409));
    const user = userEvent.setup();

    renderWithProviders(<ProfilePage />);
    await screen.findByText("playerone");
    await user.click(screen.getByRole("button", { name: "Change username" }));

    const input = screen.getByDisplayValue("playerone");
    await user.clear(input);
    await user.type(input, "takenname");
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("That username is already taken.")).toBeInTheDocument();
  });

  it("uploads a new avatar when a valid image is selected", async () => {
    setUp();
    vi.mocked(uploadAvatar).mockResolvedValue({ avatarUrl: "https://signed.example.com/avatar.png" });
    const user = userEvent.setup();

    renderWithProviders(<ProfilePage />);
    await screen.findByText("playerone");

    const file = new File(["fake"], "avatar.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(vi.mocked(uploadAvatar).mock.calls[0]?.[0]).toBe(file));
  });

  it("rejects an oversized image client-side without calling the API", async () => {
    setUp();
    const user = userEvent.setup();

    renderWithProviders(<ProfilePage />);
    await screen.findByText("playerone");

    const oversized = new File([new ArrayBuffer(6 * 1024 * 1024)], "big.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, oversized);

    expect(await screen.findByText(/5MB or smaller/)).toBeInTheDocument();
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it("signs out and returns to the landing page", async () => {
    setUp();
    vi.mocked(authClient.signOut).mockResolvedValue(undefined as never);
    const user = userEvent.setup();

    renderWithProviders(<ProfilePage />);
    await screen.findByText("playerone");
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(authClient.signOut).toHaveBeenCalledTimes(1);
  });

  it("arms a delete confirmation before actually deleting", async () => {
    setUp();
    const user = userEvent.setup();

    renderWithProviders(<ProfilePage />);
    await screen.findByText("playerone");
    await user.click(screen.getByRole("button", { name: "Delete account" }));

    expect(screen.getByText("Delete your account? This can't be undone.")).toBeInTheDocument();
    expect(authClient.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the account after confirmation", async () => {
    setUp();
    vi.mocked(authClient.deleteUser).mockResolvedValue({ error: null } as never);
    const user = userEvent.setup();

    renderWithProviders(<ProfilePage />);
    await screen.findByText("playerone");
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));

    expect(authClient.deleteUser).toHaveBeenCalledTimes(1);
  });

  it("renders saved lineups with their frozen totals and slot list", async () => {
    setUp();
    vi.mocked(fetchSavedLineups).mockResolvedValue([makeSavedLineup()]);

    renderWithProviders(<ProfilePage />);
    await screen.findByText("playerone");

    expect(await screen.findByText("81.8 pts · $18,200 of $50,000")).toBeInTheDocument();
    expect(screen.getByText("Anthony Davis")).toBeInTheDocument();
    expect(screen.getByText("43.3 pts · $9,900")).toBeInTheDocument();
    // No prediction drift was derivable for this lineup.
    expect(screen.getByText(/drift can't be computed/)).toBeInTheDocument();
  });

  it("titles a named lineup by its name instead of the save date", async () => {
    setUp();
    vi.mocked(fetchSavedLineups).mockResolvedValue([makeSavedLineup({ name: "Week 3 flyers" })]);

    renderWithProviders(<ProfilePage />);
    await screen.findByText("playerone");

    expect(await screen.findByText("Week 3 flyers")).toBeInTheDocument();
  });

  it("describes prediction drift since the save in words", async () => {
    setUp();
    vi.mocked(fetchSavedLineups).mockResolvedValue([
      makeSavedLineup({ drift: { pointsDelta: 4.6, salaryDelta: 1_200, isOverBudget: false } }),
    ]);

    renderWithProviders(<ProfilePage />);
    await screen.findByText("playerone");

    expect(await screen.findByText("Since you saved it: 4.6 pts up, $1,200 up.")).toBeInTheDocument();
  });

  it("calls out a saved lineup whose latest salaries bust the cap", async () => {
    setUp();
    vi.mocked(fetchSavedLineups).mockResolvedValue([
      makeSavedLineup({
        totalSalaryAtSave: 47_400,
        drift: { pointsDelta: -2.3, salaryDelta: 4_100, isOverBudget: true },
      }),
    ]);

    renderWithProviders(<ProfilePage />);
    await screen.findByText("playerone");

    expect(
      await screen.findByText("Since you saved it: 2.3 pts down, $4,100 up, $1,500 over the $50,000 cap.")
    ).toBeInTheDocument();
  });

  it("points to the optimizer when no lineups are saved yet", async () => {
    setUp();

    renderWithProviders(<ProfilePage />);
    await screen.findByText("playerone");

    expect(await screen.findByText(/No lineups saved yet\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Build one on the optimizer" })).toHaveAttribute("href", "/optimizer");
  });

  it("offers a retry when saved lineups fail to load", async () => {
    setUp();
    vi.mocked(fetchSavedLineups).mockRejectedValueOnce(new ApiError("boom", 500));
    const user = userEvent.setup();

    renderWithProviders(<ProfilePage />);
    await screen.findByText("playerone");

    expect(await screen.findByText(/Could not load your saved lineups\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText(/No lineups saved yet\./)).toBeInTheDocument();
  });

  it("deletes a saved lineup when its remove button is clicked", async () => {
    setUp();
    vi.mocked(fetchSavedLineups).mockResolvedValue([makeSavedLineup()]);
    vi.mocked(deleteSavedLineup).mockResolvedValue({ deleted: true });
    const user = userEvent.setup();

    renderWithProviders(<ProfilePage />);
    await screen.findByText("playerone");
    await user.click(await screen.findByRole("button", { name: "Remove" }));

    expect(deleteSavedLineup).toHaveBeenCalledWith("saved-1");
  });
});
