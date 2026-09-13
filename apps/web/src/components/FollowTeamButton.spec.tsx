import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FollowTeamButton } from "./FollowTeamButton";
import { useSession } from "@/lib/authClient";
import { fetchMe, updateMe } from "@/lib/meApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { MeProfile, Team } from "@/types/nba";

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

describe("FollowTeamButton", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing for a signed-out visitor", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);

    const { container } = renderWithProviders(<FollowTeamButton teamId={LAKERS.id} teamName="Los Angeles Lakers" />);

    expect(container).toBeEmptyDOMElement();
  });

  describe("signed in", () => {
    beforeEach(() => {
      vi.mocked(useSession).mockReturnValue({
        data: { user: { email: "user@example.com", name: "Test User" } },
        isPending: false,
      } as never);
    });

    it("shows Follow when this team isn't the user's favourite", async () => {
      vi.mocked(fetchMe).mockResolvedValue(makeProfile());

      renderWithProviders(<FollowTeamButton teamId={LAKERS.id} teamName="Los Angeles Lakers" />);

      expect(await screen.findByRole("button", { name: "Follow Los Angeles Lakers" })).toBeInTheDocument();
    });

    it("shows Following when this team is the user's favourite", async () => {
      vi.mocked(fetchMe).mockResolvedValue(makeProfile({ favoriteTeam: LAKERS }));

      renderWithProviders(<FollowTeamButton teamId={LAKERS.id} teamName="Los Angeles Lakers" />);

      expect(await screen.findByRole("button", { name: "Unfollow Los Angeles Lakers" })).toBeInTheDocument();
    });

    it("sets favoriteTeamId on follow", async () => {
      vi.mocked(fetchMe).mockResolvedValue(makeProfile());
      vi.mocked(updateMe).mockResolvedValue(makeProfile({ favoriteTeam: LAKERS }));
      const user = userEvent.setup();

      renderWithProviders(<FollowTeamButton teamId={LAKERS.id} teamName="Los Angeles Lakers" />);
      await user.click(await screen.findByRole("button", { name: "Follow Los Angeles Lakers" }));

      await waitFor(() => expect(updateMe).toHaveBeenCalledWith({ favoriteTeamId: LAKERS.id }));
    });

    it("clears favoriteTeamId on unfollow", async () => {
      vi.mocked(fetchMe).mockResolvedValue(makeProfile({ favoriteTeam: LAKERS }));
      vi.mocked(updateMe).mockResolvedValue(makeProfile());
      const user = userEvent.setup();

      renderWithProviders(<FollowTeamButton teamId={LAKERS.id} teamName="Los Angeles Lakers" />);
      await user.click(await screen.findByRole("button", { name: "Unfollow Los Angeles Lakers" }));

      await waitFor(() => expect(updateMe).toHaveBeenCalledWith({ favoriteTeamId: null }));
    });
  });
});
