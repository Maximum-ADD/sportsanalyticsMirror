import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { useSession } from "@/lib/authClient";
import { fetchMe } from "@/lib/meApi";
import { fetchTeamResults } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { MeProfile, TeamResult } from "@/types/nba";
import { YourTeamsList } from "./YourTeamsList";

vi.mock("@/lib/authClient", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/meApi", () => ({ fetchMe: vi.fn() }));
vi.mock("@/lib/nbaApi", () => ({ fetchTeamResults: vi.fn() }));

// A full Team, because MeProfile.favoriteTeam is one. The results feed only
// returns the narrower summary, which this is structurally compatible with,
// so the same fixture serves both.
const THUNDER = {
  id: "team-okc",
  nbaTeamId: 1610612760,
  name: "Thunder",
  city: "Oklahoma City",
  abbreviation: "OKC",
  conference: "West",
  division: "Northwest",
  logoUrl: null,
};

const NUGGETS = {
  id: "team-den",
  nbaTeamId: 1610612743,
  name: "Nuggets",
  city: "Denver",
  abbreviation: "DEN",
  logoUrl: null,
};

const ME: MeProfile = {
  id: "user-1",
  email: "player@example.com",
  name: "Player One",
  username: "playerone",
  avatarUrl: null,
  favoriteTeam: THUNDER,
  followedPlayers: [],
};

function createResult(overrides: Partial<TeamResult> = {}): TeamResult {
  return {
    gameId: "game-1",
    nbaGameId: "0022500612",
    gameDate: "2026-01-14T00:00:00.000Z",
    season: "2025-26",
    yourTeam: THUNDER,
    opponent: NUGGETS,
    yourScore: 121,
    opponentScore: 118,
    won: true,
    playedAtHome: true,
    modelCall: {
      predictedWinner: "YOUR_TEAM",
      yourTeamWinProbability: 0.64,
      predictedMarginInPoints: 5.1,
      marginMethod: "regression",
      wasCorrect: true,
    },
    ...overrides,
  };
}

function signedIn(profile: MeProfile = ME) {
  vi.mocked(useSession).mockReturnValue({ data: { user: { id: "user-1" } }, isPending: false } as never);
  vi.mocked(fetchMe).mockResolvedValue(profile);
}

describe("YourTeamsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedIn();
    vi.mocked(fetchTeamResults).mockResolvedValue({ data: [createResult()] });
  });

  it("names the team the user actually supports in the heading", async () => {
    renderWithProviders(<YourTeamsList />);

    expect(
      await screen.findByRole("heading", { name: /your team · oklahoma city thunder/i })
    ).toBeInTheDocument();
  });

  it("leads with your team and its score, not the home side", async () => {
    renderWithProviders(<YourTeamsList />);

    expect(await screen.findByText("121–118")).toBeInTheDocument();
    expect(screen.getByText("W")).toBeInTheDocument();
  });

  // The row no longer leads with the home team, so ordering cannot imply the
  // venue any more — the word has to carry it.
  it("says vs for a home game and at for an away one", async () => {
    const { unmount } = renderWithProviders(<YourTeamsList />);
    expect(await screen.findByText("vs")).toBeInTheDocument();
    unmount();

    vi.mocked(fetchTeamResults).mockResolvedValue({ data: [createResult({ playedAtHome: false })] });
    renderWithProviders(<YourTeamsList />);

    expect(await screen.findByText("at")).toBeInTheDocument();
  });

  it("shows the model's probability from your team's side", async () => {
    renderWithProviders(<YourTeamsList />);

    expect(await screen.findByText(/model: OKC 64%/)).toBeInTheDocument();
  });

  // An absent prediction is not a 50/50 call, and rendering one would invent a
  // forecast predict_games.py never made.
  it("says there was no model call rather than inventing a probability", async () => {
    vi.mocked(fetchTeamResults).mockResolvedValue({ data: [createResult({ modelCall: null })] });

    renderWithProviders(<YourTeamsList />);

    expect(await screen.findByText(/no model call/i)).toBeInTheDocument();
    expect(screen.queryByText(/50%/)).not.toBeInTheDocument();
  });

  it("marks a loss without relying on colour alone", async () => {
    vi.mocked(fetchTeamResults).mockResolvedValue({
      data: [createResult({ won: false, yourScore: 104, opponentScore: 118 })],
    });

    renderWithProviders(<YourTeamsList />);

    expect(await screen.findByText("L")).toBeInTheDocument();
  });

  it("links each result to the game it came from", async () => {
    renderWithProviders(<YourTeamsList />);

    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", "/games/game-1");
  });

  // The two empty cases have different fixes, and telling the user the wrong
  // one sends them somewhere that cannot help.
  it("tells a user with no team where to choose one", async () => {
    signedIn({ ...ME, favoriteTeam: null });
    vi.mocked(fetchTeamResults).mockResolvedValue({ data: [] });

    renderWithProviders(<YourTeamsList />);

    expect(await screen.findByRole("link", { name: /your profile/i })).toHaveAttribute("href", "/profile");
  });

  it("says a chosen team simply has no games yet", async () => {
    vi.mocked(fetchTeamResults).mockResolvedValue({ data: [] });

    renderWithProviders(<YourTeamsList />);

    expect(await screen.findByText(/no completed games on record for thunder/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /your profile/i })).not.toBeInTheDocument();
  });

  it("invites a signed-out visitor in rather than showing an error", async () => {
    vi.mocked(fetchTeamResults).mockRejectedValue(new ApiError("Sign in required", 401));

    renderWithProviders(<YourTeamsList />);

    expect(await screen.findByText(/sign in and pick a team/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  it("offers a retry when the feed genuinely fails", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchTeamResults).mockRejectedValue(new ApiError("boom", 500));

    renderWithProviders(<YourTeamsList />);

    await user.click(await screen.findByRole("button", { name: /try again/i }));
    expect(fetchTeamResults).toHaveBeenCalled();
  });
});
