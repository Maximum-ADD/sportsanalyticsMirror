import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPlayers } from "@/lib/nbaApi";
import { fetchSuggestedPlayers } from "@/lib/meApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMe } from "@/lib/useMe";
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
  // Shows a "Suggested" list before anything is typed: the signed-in user's
  // followed players first, then their favourite team roster ranked by
  // usage% (or, with no favourite team, the league's top scorers) filling
  // the rest — see useSuggestedPlayers. Off by default since the
  // optimizer's own use of this combobox has no use for it; the compare
  // page opts in.
  suggestWhenEmpty?: boolean;
}

// Suggestions shown before the user has typed anything, in priority order:
// 1. Every player this user already follows — the players they've told the
//    app they care about are a stronger signal than a generic ranking, so
//    they lead regardless of how many there are.
// 2. Then, up to MAX_RESULTS total, the signed-in user's favourite team
//    roster by usage% — or, with no favourite team (or signed out), the
//    league's current top scorers, which needs no signed-in user at all.
// A player followed AND on the favourite team roster is not repeated.
function useSuggestedPlayers(enabled: boolean) {
  const { data: me } = useMe();
  const favoriteTeamId = me?.favoriteTeam?.id;
  const followedPlayers = me?.followedPlayers ?? [];

  const teamSuggestionsQuery = useQuery({
    queryKey: ["suggestedPlayers", "team", favoriteTeamId],
    queryFn: () => fetchSuggestedPlayers(favoriteTeamId!, MAX_RESULTS),
    enabled: enabled && !!favoriteTeamId,
  });

  const topScorersQuery = useQuery({
    queryKey: ["suggestedPlayers", "topScorers"],
    queryFn: () => fetchPlayers({ sort: "ppg", pageSize: MAX_RESULTS }),
    enabled: enabled && !favoriteTeamId,
  });

  const rosterQuery = favoriteTeamId ? teamSuggestionsQuery : topScorersQuery;
  const rosterPlayers = favoriteTeamId
    ? (teamSuggestionsQuery.data?.players ?? []).map((entry) => entry.player)
    : (topScorersQuery.data?.data ?? []);

  const followedIds = new Set(followedPlayers.map((player) => player.id));
  // Capped independently: followed players always all show (the user
  // explicitly chose them), and the roster/top-scorers list still fills up
  // to MAX_RESULTS of its own rather than being squeezed out by however
  // many are followed.
  const rest = rosterPlayers.filter((player) => !followedIds.has(player.id)).slice(0, MAX_RESULTS);

  return {
    isPending: rosterQuery.isPending,
    followed: followedPlayers,
    rest,
    usingFavoriteTeam: !!favoriteTeamId,
  };
}

// A search box that resolves a typed name to a Player via GET /v1/players.
// Used by the compare page to add a player to (or start) a comparison.
export function PlayerSearchCombobox({
  onSelect,
  excludedPlayerIds = [],
  placeholder = "Search a player by name",
  label = "Search a player to compare",
  variant = "dark",
  suggestWhenEmpty = false,
}: PlayerSearchComboboxProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), SEARCH_DEBOUNCE_IN_MILLISECONDS);
  const isSearchable = debouncedSearchTerm.length >= MINIMUM_SEARCH_LENGTH;
  const showSuggestions = suggestWhenEmpty && isFocused && !isSearchable;

  const resultsQuery = useQuery({
    queryKey: ["playerSearch", debouncedSearchTerm],
    queryFn: () => fetchPlayers({ search: debouncedSearchTerm, pageSize: MAX_RESULTS }),
    enabled: isSearchable,
  });

  const suggestions = useSuggestedPlayers(showSuggestions);

  const results = (resultsQuery.data?.data ?? []).filter(
    (player) => !excludedPlayerIds.includes(player.id)
  );
  const followedSuggestions = suggestions.followed.filter((player) => !excludedPlayerIds.includes(player.id));
  const restSuggestions = suggestions.rest.filter((player) => !excludedPlayerIds.includes(player.id));
  const hasSuggestions = followedSuggestions.length > 0 || restSuggestions.length > 0;

  function selectPlayer(player: Player) {
    onSelect(player);
    setSearchTerm("");
  }

  function renderPlayerOption(player: Player) {
    return (
      <li key={player.id}>
        <button
          type="button"
          className={cn("flex w-full items-center gap-2 px-3 py-2 text-left", VARIANT_CLASSES[variant].item)}
          // Mousedown (not click) fires before the input's blur, so the
          // suggestion list is still mounted when the selection is made.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectPlayer(player)}
        >
          <PlayerHeadshot player={player} size="sm" />
          <span className="flex-1">
            {player.firstName} {player.lastName}
          </span>
          {player.team && <TeamBadge team={player.team} size="sm" />}
        </button>
      </li>
    );
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
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />

      {isSearchable && (
        <ul className={cn("absolute z-10 mt-1 max-h-72 w-full overflow-auto", VARIANT_CLASSES[variant].list)}>
          {resultsQuery.isPending ? (
            <li className={VARIANT_CLASSES[variant].status}>Searching…</li>
          ) : results.length === 0 ? (
            <li className={VARIANT_CLASSES[variant].status}>No players found.</li>
          ) : (
            results.map(renderPlayerOption)
          )}
        </ul>
      )}

      {showSuggestions && (
        <ul className={cn("absolute z-10 mt-1 max-h-72 w-full overflow-auto", VARIANT_CLASSES[variant].list)}>
          {suggestions.isPending ? (
            <li className={VARIANT_CLASSES[variant].status}>Loading suggestions…</li>
          ) : !hasSuggestions ? (
            <li className={VARIANT_CLASSES[variant].status}>Type a name to search.</li>
          ) : (
            <>
              {followedSuggestions.length > 0 && (
                <>
                  <li className={cn(VARIANT_CLASSES[variant].status, "font-mono text-[9px] tracking-[0.1em] uppercase")}>
                    Following
                  </li>
                  {followedSuggestions.map(renderPlayerOption)}
                </>
              )}
              {restSuggestions.length > 0 && (
                <>
                  <li className={cn(VARIANT_CLASSES[variant].status, "font-mono text-[9px] tracking-[0.1em] uppercase")}>
                    {suggestions.usingFavoriteTeam ? "Your team" : "Top scorers"}
                  </li>
                  {restSuggestions.map(renderPlayerOption)}
                </>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
