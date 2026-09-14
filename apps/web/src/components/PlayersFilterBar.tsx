import { Search } from "lucide-react";
import type { Team } from "@/types/nba";

const POSITIONS = ["G", "F", "C", "G-F", "F-C"];

// "name" is the client's label for the API's alphabetical default (the sort
// param is simply omitted); the rest map one-to-one onto the ranked
// listing's sort keys.
export type PlayerSortKey = "name" | "ppg" | "rpg" | "apg" | "ts";

// Which direction the ranking runs. Descending is the leaderboard reading
// (most first, or Z→A for names); ascending is its mirror — fewest first,
// A→Z for names.
export type PlayerSortOrder = "asc" | "desc";

// The participation floors offered by the min-games filter. "Any" (undefined)
// sends no floor at all — the option element's empty value maps back to
// undefined in the change handler.
const MIN_GAMES_OPTIONS = [5, 10, 15, 20];

const FILTER_CHIP_CLASS =
  "border border-landing-light bg-landing-hero px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] text-landing-ink uppercase focus:outline-none";

interface PlayersFilterBarProps {
  teams: Team[];
  searchTerm: string;
  teamId: string | undefined;
  position: string | undefined;
  sortKey: PlayerSortKey;
  minGames: number | undefined;
  onSearchChange: (searchTerm: string) => void;
  onTeamChange: (teamId: string | undefined) => void;
  onPositionChange: (position: string | undefined) => void;
  onSortChange: (sortKey: PlayerSortKey) => void;
  onMinGamesChange: (minGames: number | undefined) => void;
  sortOrder: PlayerSortOrder;
  onSortOrderChange: (sortOrder: PlayerSortOrder) => void;
  // Followed-only toggle. Optional because the bar also serves pages with
  // no follow concept — when `showFollowingFilter` is false the chip is
  // not rendered at all.
  showFollowingFilter?: boolean;
  followedCount?: number;
  followedOnly?: boolean;
  onFollowedOnlyChange?: (followedOnly: boolean) => void;
}

export function PlayersFilterBar({
  teams,
  searchTerm,
  teamId,
  position,
  sortKey,
  minGames,
  onSearchChange,
  onTeamChange,
  onPositionChange,
  onSortChange,
  onMinGamesChange,
  sortOrder,
  onSortOrderChange,
  showFollowingFilter = false,
  followedCount = 0,
  followedOnly = false,
  onFollowedOnlyChange,
}: PlayersFilterBarProps) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2.5">
      <div className="flex items-center gap-2 border border-landing-light bg-landing-hero px-2.5 py-1.5">
        <Search aria-hidden className="size-3.5 text-locker-ink-muted" />
        <input
          type="search"
          aria-label="Search players"
          className="w-44 bg-transparent text-[12.5px] text-landing-ink placeholder:text-locker-ink-muted focus:outline-none"
          placeholder="Search players"
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      <select
        aria-label="Filter players by team"
        className={FILTER_CHIP_CLASS}
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
        aria-label="Filter players by position"
        className={FILTER_CHIP_CLASS}
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
        aria-label="Sort players"
        className={FILTER_CHIP_CLASS}
        value={sortKey}
        onChange={(event) => onSortChange(event.target.value as PlayerSortKey)}
      >
        <option value="name">Sort: Name</option>
        <option value="ppg">Sort: Points per game</option>
        <option value="rpg">Sort: Rebounds per game</option>
        <option value="apg">Sort: Assists per game</option>
        <option value="ts">Sort: True shooting</option>
      </select>

      <select
        aria-label="Sort direction"
        className={FILTER_CHIP_CLASS}
        value={sortOrder}
        onChange={(event) => onSortOrderChange(event.target.value as PlayerSortOrder)}
      >
        <option value="desc">Order: High to low</option>
        <option value="asc">Order: Low to high</option>
      </select>

      <select
        aria-label="Filter players by minimum games"
        className={FILTER_CHIP_CLASS}
        value={minGames ?? ""}
        onChange={(event) =>
          onMinGamesChange(event.target.value === "" ? undefined : Number(event.target.value))
        }
      >
        <option value="">Min. games: Any</option>
        {MIN_GAMES_OPTIONS.map((gamesOption) => (
          <option key={gamesOption} value={gamesOption}>
            Min. games: {gamesOption}
          </option>
        ))}
      </select>

      {showFollowingFilter && (
        // aria-pressed (not a checkbox) because this narrows the list in
        // place, the same toggle idiom the Follow buttons already use.
        <button
          type="button"
          aria-pressed={followedOnly}
          aria-label="Show followed players only"
          onClick={() => onFollowedOnlyChange?.(!followedOnly)}
          className={`border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors focus:outline-none ${
            followedOnly
              ? "border-locker-leather bg-locker-leather text-white"
              : "border-landing-light bg-landing-hero text-landing-ink hover:border-locker-leather"
          }`}
        >
          Following · {followedCount}
        </button>
      )}
    </div>
  );
}
