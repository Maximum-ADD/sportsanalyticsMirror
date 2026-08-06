import type { Team } from "@/types/nba";

const POSITIONS = ["G", "F", "C", "G-F", "F-C"];
export type PlayerSortKey = "name" | "ppg";

const selectClassName =
  "rounded-md border border-border-subtle bg-surface-card px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/50";

interface PlayersFilterBarProps {
  teams: Team[];
  teamId: string | undefined;
  position: string | undefined;
  sortKey: PlayerSortKey;
  onTeamChange: (teamId: string | undefined) => void;
  onPositionChange: (position: string | undefined) => void;
  onSortChange: (sortKey: PlayerSortKey) => void;
}

export function PlayersFilterBar({
  teams,
  teamId,
  position,
  sortKey,
  onTeamChange,
  onPositionChange,
  onSortChange,
}: PlayersFilterBarProps) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <select
        className={selectClassName}
        value={teamId ?? ""}
        onChange={(event) => onTeamChange(event.target.value || undefined)}
      >
        <option value="">All teams</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.city} {team.name}
          </option>
        ))}
      </select>

      <select
        className={selectClassName}
        value={position ?? ""}
        onChange={(event) => onPositionChange(event.target.value || undefined)}
      >
        <option value="">All positions</option>
        {POSITIONS.map((positionOption) => (
          <option key={positionOption} value={positionOption}>
            {positionOption}
          </option>
        ))}
      </select>

      <select
        className={selectClassName}
        value={sortKey}
        onChange={(event) => onSortChange(event.target.value as PlayerSortKey)}
      >
        <option value="name">Sort: Name</option>
        <option value="ppg">Sort: Points per game</option>
      </select>
    </div>
  );
}
