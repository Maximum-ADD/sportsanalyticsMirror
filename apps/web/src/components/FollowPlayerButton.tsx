import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/apiClient";
import { fetchWatchedPlayerIds, followPlayer, unfollowPlayer } from "@/lib/nbaApi";
import { signInWithGoogle } from "@/lib/authClient";
import { Button } from "@/components/ui/button";

const UNAUTHENTICATED_STATUS = 401;

/** The id list every follow write invalidates, alongside the board itself. */
const WATCHED_IDS_KEY = ["watchedPlayerIds"];

interface FollowPlayerButtonProps {
  playerId: string;
}

/**
 * Adds a player to — or drops them from — the signed-in user's watchlist.
 *
 * This is the only place in the app that can *start* a follow, which is what
 * makes /home's watchlist board reachable at all: the board manages and
 * removes follows, but a player has to be found first, and the player pages
 * are where finding happens.
 *
 * A signed-out visitor gets a sign-in prompt in place of the control rather
 * than a button that fails on click — the follow is stored against an account
 * and there is nowhere to put it otherwise.
 */
export function FollowPlayerButton({ playerId }: FollowPlayerButtonProps) {
  const queryClient = useQueryClient();

  const watchedQuery = useQuery({
    queryKey: WATCHED_IDS_KEY,
    queryFn: fetchWatchedPlayerIds,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === UNAUTHENTICATED_STATUS) && failureCount < 2,
  });

  const isFollowing = watchedQuery.data?.playerIds.includes(playerId) ?? false;

  const toggleMutation = useMutation({
    // The two routes answer with different shapes and the button needs
    // neither — it re-reads the id list, which is the thing it renders from.
    mutationFn: async (): Promise<void> => {
      if (isFollowing) {
        await unfollowPlayer(playerId);
        return;
      }
      await followPlayer(playerId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WATCHED_IDS_KEY });
      // The home board reads a different endpoint, so it is stale too.
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  if (watchedQuery.error instanceof ApiError && watchedQuery.error.status === UNAUTHENTICATED_STATUS) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => signInWithGoogle(window.location.href)}>
        Sign in to follow
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={isFollowing ? "outline" : "default"}
        size="sm"
        disabled={watchedQuery.isPending || toggleMutation.isPending}
        // The state is in the label, not only in the button's fill, so it
        // reads the same in greyscale and to a screen reader.
        aria-pressed={isFollowing}
        onClick={() => toggleMutation.mutate()}
      >
        {toggleMutation.isPending ? "Saving…" : isFollowing ? "On your watchlist" : "Add to watchlist"}
      </Button>
      {toggleMutation.error instanceof Error && (
        <span role="alert" className="text-xs text-text-muted">
          {toggleMutation.error.message}
        </span>
      )}
    </div>
  );
}
