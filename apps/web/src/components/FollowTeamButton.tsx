import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateMe } from "@/lib/meApi";
import { invalidatePreferenceQueries } from "@/lib/preferenceQueries";
import { useMe } from "@/lib/useMe";

interface FollowTeamButtonProps {
  teamId: string;
  teamName: string;
}

// Follows exactly one team at a time, backed by User.favoriteTeamId — the
// same single-team relationship onboarding and the profile page already
// write through PATCH /v1/me. There is no multi-team follow table (see
// TeamResultsService's own doc comment on why an earlier one was dropped),
// so following a second team here replaces the first rather than adding to
// a list.
//
// Hidden entirely for a signed-out visitor, same as FollowPlayerButton.
export function FollowTeamButton({ teamId, teamName }: FollowTeamButtonProps) {
  const { data: me, session } = useMe();
  const queryClient = useQueryClient();

  const followMutation = useMutation({
    mutationFn: () => updateMe({ favoriteTeamId: teamId }),
    onSuccess: () => invalidatePreferenceQueries(queryClient),
  });
  const unfollowMutation = useMutation({
    mutationFn: () => updateMe({ favoriteTeamId: null }),
    onSuccess: () => invalidatePreferenceQueries(queryClient),
  });

  if (!session || !me) return null;

  const isFollowing = me.favoriteTeam?.id === teamId;
  const isPending = followMutation.isPending || unfollowMutation.isPending;

  return (
    <>
      <button
        type="button"
        aria-pressed={isFollowing}
        aria-label={isFollowing ? `Unfollow ${teamName}` : `Follow ${teamName}`}
        disabled={isPending}
        onClick={(event) => {
          followMutation.reset();
          unfollowMutation.reset();
          event.preventDefault();
          event.stopPropagation();
          if (isFollowing) unfollowMutation.mutate();
          else followMutation.mutate();
        }}
        className={`border px-3 py-1 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors disabled:opacity-50 ${
          isFollowing
            ? "border-locker-leather bg-locker-leather text-white hover:border-locker-bad hover:bg-locker-bad"
            : "border-landing-light bg-locker-surface text-landing-ink hover:border-locker-leather"
        }`}
      >
        {isFollowing ? "Following" : "Follow"}
      </button>
      {(followMutation.isError || unfollowMutation.isError) && (
        <span role="alert">Could not save your preference. Please try again.</span>
      )}
    </>
  );
}
