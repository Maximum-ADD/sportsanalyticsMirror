import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import {
  makeProspectLeaderboard,
  makeProspectRankSummary,
} from "@/test/becomeProFixtures";
import {
  fetchMyProspectRank,
  fetchProspectDirectory,
  fetchProspectLeaderboard,
} from "@/lib/becomeProApi";
import { fetchMe } from "@/lib/meApi";
import { useSession } from "@/lib/authClient";
import { BecomeProPage } from "./BecomeProPage";
import type { MeProfile } from "@/types/nba";

vi.mock("@/lib/authClient", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/meApi", () => ({
  fetchMe: vi.fn(),
}));

vi.mock("@/lib/becomeProApi", () => ({
  PROSPECT_RANK_QUERY_KEY: ["prospectRank"],
  PROSPECT_LEADERBOARD_QUERY_KEY: ["prospectLeaderboard"],
  PROSPECT_DIRECTORY_QUERY_KEY: ["prospectDirectory"],
  fetchMyProspectRank: vi.fn(),
  fetchProspectLeaderboard: vi.fn(),
  fetchProspectDirectory: vi.fn(),
}));

const ME: MeProfile = {
  id: "user-1",
  email: "kiran@example.com",
  name: "Kiran",
  username: "kiran",
  avatarUrl: null,
  favoriteTeam: null,
  followedPlayers: [],
  role: "USER",
};

function signIn() {
  vi.mocked(useSession).mockReturnValue({
    data: { user: { name: "Kiran" } },
    isPending: false,
  } as never);
  vi.mocked(fetchMe).mockResolvedValue(ME);
}

function signOut() {
  vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);
}

describe("BecomeProPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchProspectLeaderboard).mockResolvedValue(makeProspectLeaderboard());
    vi.mocked(fetchProspectDirectory).mockResolvedValue({
      data: [],
      page: 1,
      pageSize: 25,
      total: 0,
    });
    vi.mocked(fetchMyProspectRank).mockResolvedValue(makeProspectRankSummary());
    signIn();
  });

  it("names the feature and says the figures are self-reported", async () => {
    renderWithProviders(<BecomeProPage />);

    expect(
      await screen.findByRole("heading", { level: 1, name: /become pro/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/self-reported by the player it belongs to/i)).toBeInTheDocument();
  });

  it("shows the board and the directory together", async () => {
    renderWithProviders(<BecomeProPage />);

    expect(await screen.findByText(/value board/i)).toBeInTheDocument();
    expect(screen.getByText(/all prospects/i)).toBeInTheDocument();
  });

  it("shows the signed-in user their own standing", async () => {
    renderWithProviders(<BecomeProPage />);

    expect(await screen.findByText("$4.37M")).toBeInTheDocument();
  });

  // Public on purpose: a board nobody can see signed out is not a board.
  describe("signed out", () => {
    beforeEach(signOut);

    it("still shows the board", async () => {
      renderWithProviders(<BecomeProPage />);

      expect(await screen.findByText(/value board/i)).toBeInTheDocument();
    });

    it("invites the visitor to sign in rather than showing an empty own-card", async () => {
      renderWithProviders(<BecomeProPage />);

      expect(await screen.findByText(/sign in to log a season of your own/i)).toBeInTheDocument();
    });
  });

  // A prospect is keyed by username on the board, so an account without one
  // cannot be ranked — pointing at onboarding beats a form that cannot work.
  it("sends a half-onboarded account to finish setting up", async () => {
    vi.mocked(fetchMe).mockResolvedValue({ ...ME, username: null });

    renderWithProviders(<BecomeProPage />);

    expect(
      await screen.findByRole("link", { name: /finish setting up your profile/i })
    ).toHaveAttribute("href", "/onboarding");
  });

  describe("the explainer", () => {
    it("says the slot is what the model predicts and the dollars follow", async () => {
      renderWithProviders(<BecomeProPage />);

      expect(await screen.findByText(/the slot is what the model actually predicts/i)).toBeInTheDocument();
    });

    it("says plainly that no language model is involved", async () => {
      renderWithProviders(<BecomeProPage />);

      expect(await screen.findByText(/no language model is involved/i)).toBeInTheDocument();
    });

    it("says the season line is derived rather than typed", async () => {
      renderWithProviders(<BecomeProPage />);

      expect(await screen.findByText(/never typed in directly/i)).toBeInTheDocument();
    });
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithProviders(<BecomeProPage />);
    await screen.findByText(/value board/i);

    await expectNoAccessibilityViolations(container);
  });
});
