import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPlayers } from "@/lib/nbaApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { TeamBadge } from "@/components/TeamBadge";
import type { Player } from "@/types/nba";

const SEARCH_DEBOUNCE_IN_MILLISECONDS = 300;
const MINIMUM_SEARCH_LENGTH = 2;
const MAX_RESULTS = 6;

interface PlayerSearchComboboxProps {
  // Called with the player the user picks from the results list.
  onSelect: (player: Player) => void;
  // Players already in the comparison — filtered out of the results so the
  // same player can't be added twice.
  excludedPlayerIds?: string[];
  placeholder?: string;
  // Accessible name for the input. The compare page renders several of these
  // at once (one per empty slot), so each needs its own distinguishable name.
  label?: string;
}

// A search box that resolves a typed name to a Player via GET /v1/players.
// Used by the compare page to add a player to (or start) a comparison.
export function PlayerSearchCombobox({
  onSelect,
  excludedPlayerIds = [],
  placeholder = "Search a player by name",
  label = "Search a player to compare",
}: PlayerSearchComboboxProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), SEARCH_DEBOUNCE_IN_MILLISECONDS);
  const isSearchable = debouncedSearchTerm.length >= MINIMUM_SEARCH_LENGTH;

  const resultsQuery = useQuery({
    queryKey: ["playerSearch", debouncedSearchTerm],
    queryFn: () => fetchPlayers({ search: debouncedSearchTerm, pageSize: MAX_RESULTS }),
    enabled: isSearchable,
  });

  const results = (resultsQuery.data?.data ?? []).filter(
    (player) => !excludedPlayerIds.includes(player.id)
  );

  function selectPlayer(player: Player) {
    onSelect(player);
    setSearchTerm("");
  }

  return (
    <div className="relative w-full">
      <input
        aria-label={label}
        className="w-full rounded-md border border-border-subtle bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-accent/50"
        type="search"
        placeholder={placeholder}
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
      />

      {isSearchable && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border-subtle bg-surface-card shadow-lg">
          {resultsQuery.isPending ? (
            <li className="px-3 py-2 text-sm text-text-muted">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">No players found.</li>
          ) : (
            results.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-raised"
                  onClick={() => selectPlayer(player)}
                >
                  <PlayerHeadshot player={player} size="sm" />
                  <span className="flex-1">
                    {player.firstName} {player.lastName}
                  </span>
                  {player.team && <TeamBadge team={player.team} size="sm" />}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
