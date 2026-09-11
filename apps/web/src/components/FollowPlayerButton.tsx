import { Heart } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { followPlayer, unfollowPlayer } from "@/lib/meApi";
import { ME_QUERY_KEY, useMe } from "@/lib/useMe";

interface FollowPlayerButtonProps {
  playerId: string;
  playerName: string;
}

// Hidden entirely for a signed-out visitor (see the null return below) —
// this app has no "sign in, then resume the action you clicked" flow
// anywhere else, so a button that can't do anything yet would just be
// confusing rather than a real affordance.
export function FollowPlayerButton({ playerId, playerName }: FollowPlayerButtonProps) {
  const { data: me, session } = useMe();
  const queryClient = useQueryClient();

  const followMutation = useMutation({
    mutationFn: () => followPlayer(playerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  });
  const unfollowMutation = useMutation({
    mutationFn: () => unfollowPlayer(playerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  });

  if (!session || !me) return null;

  const isFollowing = me.followedPlayers.some((player) => player.id === playerId);
  const isPending = followMutation.isPending || unfollowMutation.isPending;

  return (
    <button
      type="button"
      aria-pressed={isFollowing}
      aria-label={isFollowing ? `Unfollow ${playerName}` : `Follow ${playerName}`}
      disabled={isPending}
      onClick={() => (isFollowing ? unfollowMutation.mutate() : followMutation.mutate())}
      className={`border p-1.5 transition-colors disabled:opacity-50 ${
        isFollowing
          ? "border-locker-leather text-locker-leather hover:border-locker-bad hover:text-locker-bad"
          : "border-landing-light text-locker-ink-muted hover:border-locker-leather hover:text-locker-leather"
      }`}
    >
      <Heart aria-hidden className="size-3.5" fill={isFollowing ? "currentColor" : "none"} />
    </button>
  );
}
