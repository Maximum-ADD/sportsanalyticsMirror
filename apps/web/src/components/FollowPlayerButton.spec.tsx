import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { fetchWatchedPlayerIds, followPlayer, unfollowPlayer } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import { FollowPlayerButton } from "./FollowPlayerButton";

vi.mock("@/lib/nbaApi", () => ({
  fetchWatchedPlayerIds: vi.fn(),
  followPlayer: vi.fn(),
  unfollowPlayer: vi.fn(),
}));

vi.mock("@/lib/authClient", () => ({ signInWithGoogle: vi.fn() }));

const PLAYER_ID = "player-sga";

describe("FollowPlayerButton", () => {
  beforeEach(() => {
    // vitest is not configured with clearMocks, so call counts would carry
    // across tests — and "the other verb was never called" is exactly the
    // assertion that makes this button's two branches distinguishable.
    vi.clearAllMocks();
    vi.mocked(fetchWatchedPlayerIds).mockResolvedValue({ playerIds: [] });
    vi.mocked(followPlayer).mockResolvedValue({ playerId: PLAYER_ID, note: null, followedAt: "2026-02-01T00:00:00.000Z" });
    vi.mocked(unfollowPlayer).mockResolvedValue({ playerId: PLAYER_ID, removed: true });
  });

  it("follows a player who is not on the watchlist yet", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FollowPlayerButton playerId={PLAYER_ID} />);

    await user.click(await screen.findByRole("button", { name: /add to watchlist/i }));

    await waitFor(() => expect(followPlayer).toHaveBeenCalledWith(PLAYER_ID));
  });

  it("unfollows a player who is already on it", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchWatchedPlayerIds).mockResolvedValue({ playerIds: [PLAYER_ID] });

    renderWithProviders(<FollowPlayerButton playerId={PLAYER_ID} />);

    await user.click(await screen.findByRole("button", { name: /on your watchlist/i }));

    await waitFor(() => expect(unfollowPlayer).toHaveBeenCalledWith(PLAYER_ID));
    expect(followPlayer).not.toHaveBeenCalled();
  });

  // The state has to survive greyscale and a screen reader, so it is carried
  // by the label and aria-pressed, never by the button's fill alone.
  it("states whether the player is followed in words", async () => {
    vi.mocked(fetchWatchedPlayerIds).mockResolvedValue({ playerIds: [PLAYER_ID] });

    renderWithProviders(<FollowPlayerButton playerId={PLAYER_ID} />);

    expect(await screen.findByRole("button", { name: /on your watchlist/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("offers sign-in instead of a button that could only fail", async () => {
    vi.mocked(fetchWatchedPlayerIds).mockRejectedValue(new ApiError("Sign in required", 401));

    renderWithProviders(<FollowPlayerButton playerId={PLAYER_ID} />);

    expect(await screen.findByRole("button", { name: /sign in to follow/i })).toBeInTheDocument();
  });
});
