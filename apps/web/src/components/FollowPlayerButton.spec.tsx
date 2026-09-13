import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { FollowPlayerButton } from "./FollowPlayerButton";
import { useSession } from "@/lib/authClient";
import { fetchMe, followPlayer, unfollowPlayer } from "@/lib/meApi";
import type { MeProfile } from "@/types/nba";

vi.mock("@/lib/authClient", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/meApi", () => ({ fetchMe: vi.fn(), followPlayer: vi.fn(), unfollowPlayer: vi.fn() }));
afterEach(() => vi.clearAllMocks());

it("refreshes the profile and invalidates fresh watchlist data after following, preserving state on failed unfollow", async () => {
  const profile: MeProfile = {
    id: "user-1", email: "user@example.com", name: "User", username: "user",
    avatarUrl: null, favoriteTeam: null, followedPlayers: [],
  };
  vi.mocked(useSession).mockReturnValue({ data: { user: { id: profile.id } }, isPending: false } as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, retry: false } } });
  queryClient.setQueryData(["me"], profile);
  queryClient.setQueryData(["watchlist"], { data: [] });
  // Only the id is consumed by this control; the server resolves full players.
  vi.mocked(fetchMe).mockResolvedValue({ ...profile, followedPlayers: [{ id: "player-1" }] } as MeProfile);
  vi.mocked(followPlayer).mockResolvedValue({ following: true });
  const user = userEvent.setup();
  render(<QueryClientProvider client={queryClient}><FollowPlayerButton playerId="player-1" playerName="Player One" /></QueryClientProvider>);
  await user.click(await screen.findByRole("button", { name: "Follow Player One" }));
  expect(followPlayer).toHaveBeenCalledWith("player-1");
  await waitFor(() => expect(queryClient.getQueryState(["watchlist"])?.isInvalidated).toBe(true));
  const unfollow = await screen.findByRole("button", { name: "Unfollow Player One" });
  await waitFor(() => expect(unfollow).toBeEnabled());
  vi.mocked(unfollowPlayer).mockRejectedValueOnce(new Error("offline"));
  await user.click(unfollow);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  expect(unfollow).toHaveAttribute("aria-pressed", "true");
  queryClient.clear();
});
