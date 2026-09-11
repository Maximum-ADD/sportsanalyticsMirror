import { useQuery } from "@tanstack/react-query";
import { fetchTeams } from "@/lib/nbaApi";
import { TeamBadge } from "@/components/TeamBadge";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import type { Team } from "@/types/nba";

// The league has exactly 30 teams — one fetch, no pagination, unlike
// TeamsListPage's own paginated list (which exists for a browse-everything
// view, not a "pick one" control like this).
const ALL_TEAMS_PAGE_SIZE = 30;

interface TeamPickerProps {
  selectedTeamId: string | null;
  onSelect: (team: Team) => void;
}

// Locker-styled grid of every NBA team, radiogroup semantics (one
// selectable team, same "select exactly one" shape LockerSegmentControl
// uses for season segments) — shared between the onboarding flow's
// "pick a favorite team" step and the Profile page's own team editor, so
// the two never drift into two different-looking pickers for the same
// choice.
export function TeamPicker({ selectedTeamId, onSelect }: TeamPickerProps) {
  const teamsQuery = useQuery({
    queryKey: ["teams", { pageSize: ALL_TEAMS_PAGE_SIZE }],
    queryFn: () => fetchTeams({ pageSize: ALL_TEAMS_PAGE_SIZE }),
  });

  if (teamsQuery.isPending) {
    return (
      <div className="flex justify-center border border-landing-light bg-locker-surface py-10">
        <BasketballSpinner size="md" label="Loading teams" />
      </div>
    );
  }

  if (teamsQuery.isError) {
    return (
      <p className="border border-landing-light bg-locker-surface p-4 text-center text-[12.5px] text-locker-ink-muted">
        Could not load teams.
      </p>
    );
  }

  const teams = teamsQuery.data?.data ?? [];

  return (
    <div
      role="radiogroup"
      aria-label="Favorite team"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
    >
      {teams.map((team) => {
        const isSelected = team.id === selectedTeamId;
        return (
          <button
            key={team.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(team)}
            className={`flex items-center gap-2 border p-2.5 text-left transition-colors ${
              isSelected
                ? "border-locker-leather bg-locker-leather/10"
                : "border-landing-light bg-locker-surface hover:border-locker-leather"
            }`}
          >
            <TeamBadge team={team} size="sm" />
            <span className="min-w-0">
              <span className="block truncate font-display text-[12.5px] text-landing-ink uppercase">
                {team.city}
              </span>
              <span className="block truncate text-[10.5px] text-locker-ink-muted">{team.name}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
