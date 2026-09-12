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
      className={`border px-3 py-1 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors disabled:opacity-50 ${
        isFollowing
          ? "border-locker-leather bg-locker-leather text-white hover:border-locker-bad hover:bg-locker-bad"
          : "border-landing-light bg-locker-surface text-landing-ink hover:border-locker-leather"
      }`}
    >
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}
