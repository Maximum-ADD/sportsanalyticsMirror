import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPlayers } from "@/lib/nbaApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { TeamBadge } from "@/components/TeamBadge";
import { cn } from "@/lib/utils";
import type { Player } from "@/types/nba";

const SEARCH_DEBOUNCE_IN_MILLISECONDS = 300;
const MINIMUM_SEARCH_LENGTH = 2;
const MAX_RESULTS = 6;

// "dark" matches the pre-locker app shell (the compare page); "locker"
// matches the light landing-derived surfaces (optimizer page). Kept as one
// component since the behaviour — debounced search, exclusion, select — is
// identical; only the paint differs.
const VARIANT_CLASSES = {
  dark: {
    input:
      "rounded-md border border-border-subtle bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-accent/50",
    list: "rounded-md border border-border-subtle bg-surface-card shadow-lg",
    status: "px-3 py-2 text-sm text-text-muted",
    item: "text-sm text-text-primary hover:bg-surface-raised",
  },
  locker: {
    input:
      "border border-landing-light bg-landing-hero px-3 py-2 text-[13px] text-landing-ink placeholder:text-locker-ink-muted focus:border-locker-leather focus:outline-none",
    list: "border border-landing-light bg-locker-surface",
    status: "px-3 py-2 text-[12.5px] text-locker-ink-muted",
    item: "text-[13px] text-landing-ink transition-colors hover:bg-landing-hero",
  },
} as const;

type ComboboxVariant = keyof typeof VARIANT_CLASSES;

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
  variant?: ComboboxVariant;
}

// A search box that resolves a typed name to a Player via GET /v1/players.
// Used by the compare page to add a player to (or start) a comparison.
export function PlayerSearchCombobox({
  onSelect,
  excludedPlayerIds = [],
  placeholder = "Search a player by name",
  label = "Search a player to compare",
  variant = "dark",
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
        className={cn("w-full", VARIANT_CLASSES[variant].input)}
        type="search"
        placeholder={placeholder}
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
      />

      {isSearchable && (
        <ul className={cn("absolute z-10 mt-1 max-h-72 w-full overflow-auto", VARIANT_CLASSES[variant].list)}>
          {resultsQuery.isPending ? (
            <li className={VARIANT_CLASSES[variant].status}>Searching…</li>
          ) : results.length === 0 ? (
            <li className={VARIANT_CLASSES[variant].status}>No players found.</li>
          ) : (
            results.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left",
                    VARIANT_CLASSES[variant].item
                  )}
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
