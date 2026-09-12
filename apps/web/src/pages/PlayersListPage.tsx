import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { fetchPlayerLeaders, fetchPlayerStatsBatch, fetchPlayerStatsBatchInChunks, fetchPlayers, fetchTeams } from "@/lib/nbaApi";
import { ErrorState } from "@/components/ErrorState";
import { FollowPlayerButton } from "@/components/FollowPlayerButton";
import { LockerSegmentControl } from "@/components/LockerSegmentControl";
import { Pagination } from "@/components/Pagination";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { PlayersFilterBar, type PlayerSortKey, type PlayerSortOrder } from "@/components/PlayersFilterBar";
import { Sparkline } from "@/components/Sparkline";
import { TeamBadge } from "@/components/TeamBadge";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { SectionLoading } from "@/components/ui/loading-overlay";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMe } from "@/lib/useMe";
import { SEASON_TYPES_IN_ORDER, formatSeasonType, parseUrlSegment, toUrlSegment } from "@/lib/seasonType";
import type { Player, PlayerLeadersResponse, PlayerSeasonLeader, PlayerStatsBatchEntry, SeasonType } from "@/types/nba";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_IN_MILLISECONDS = 300;

// The leaderboard table's trend column plots this many most-recent games —
// enough to read a player's recent form without the cell needing more width
// than the numbers beside it.
const SPARKLINE_GAME_COUNT = 8;

// Player, team, position, jersey, then the four rate columns and the trend
// column. The follow column only appears for a signed-in visitor.
const BASE_COLUMN_COUNT = 9;

// The leaders band's four categories, in display order. `value` picks the
// figure each category ranks by and `format` renders it — a TS% leader
// carries a percentage, the per-game categories one decimal place.
const LEADER_CATEGORIES: {
  key: keyof PlayerLeadersResponse["leaders"];
  label: string;
  selectValue: (leader: PlayerSeasonLeader) => number;
  formatValue: (value: number) => string;
}[] = [
  { key: "ppg", label: "Points per game", selectValue: (leader) => leader.value, formatValue: (v) => v.toFixed(1) },
  { key: "rpg", label: "Rebounds per game", selectValue: (leader) => leader.value, formatValue: (v) => v.toFixed(1) },
  { key: "apg", label: "Assists per game", selectValue: (leader) => leader.value, formatValue: (v) => v.toFixed(1) },
  { key: "tsPct", label: "True shooting", selectValue: (leader) => leader.value, formatValue: (v) => `${v.toFixed(1)}%` },
];

const TABLE_HEADERS = ["Player", "Team", "Pos", "#", "PPG", "RPG", "APG", "TS%", "Last 8"] as const;

// Client-side ranking for the followed-only view. That list comes from the
// signed-in profile rather than the ranked API, so the page reproduces the
// server ranking's contract itself: a player with no games-played figure
// in the segment sinks below everyone else (the API sorts those to
// Number.NEGATIVE_INFINITY), ties break alphabetically on last name, and
// "name" is the API's alphabetical default (lastName ascending).
const FOLLOWED_SORT_VALUE_SINK = Number.NEGATIVE_INFINITY;

const FOLLOWED_SORT_SELECTORS: Record<
  Exclude<PlayerSortKey, "name">,
  (averages: PlayerStatsBatchEntry["seasonAverages"]) => number
> = {
  ppg: (averages) => averages.pointsPerGame,
  rpg: (averages) => averages.reboundsPerGame,
  apg: (averages) => averages.assistsPerGame,
  ts: (averages) => averages.trueShootingPercentage,
};

function comparePlayersAlphabetically(playerA: Player, playerB: Player): number {
  return playerA.lastName.localeCompare(playerB.lastName);
}

// Descending stat ranking with the alphabetical tiebreak — a copy is
// sorted so the caller's array (often a memo output) is never mutated.
function rankPlayersByStat(
  players: Player[],
  selectSortValue: (player: Player) => number,
  sortOrder: PlayerSortOrder
): Player[] {
  return [...players].sort((playerA, playerB) => {
    const byStat =
      sortOrder === "asc"
        ? selectSortValue(playerA) - selectSortValue(playerB)
        : selectSortValue(playerB) - selectSortValue(playerA);
    return byStat || comparePlayersAlphabetically(playerA, playerB);
  });
}

export function PlayersListPage() {
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, data: me } = useMe();

  // Same ?segment= parameter the player profile and compare pages use, so
  // the selection survives a reload and a link into a postseason list is
  // shareable.
  const seasonType = parseUrlSegment(searchParams.get("segment"));
  const isPostseasonSegment = seasonType !== "REGULAR";

  function selectSeasonType(nextSeasonType: SeasonType) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("segment", toUrlSegment(nextSeasonType));
    setSearchParams(nextParams, { replace: true });
    setPage(1);
  }
  const [searchTerm, setSearchTerm] = useState("");
  const [teamId, setTeamId] = useState<string | undefined>(undefined);
  const [position, setPosition] = useState<string | undefined>(undefined);
  // The leaderboard's default ranking — the mockup presents this page as a
  // scoring leaderboard first, with alphabetical as the opt-out.
  const [sortKey, setSortKey] = useState<PlayerSortKey>("ppg");
  // Leaderboards read most-first, so descending is the default; the toggle
  // mirrors the ranking (and the alphabetical one) on request.
  const [sortOrder, setSortOrder] = useState<PlayerSortOrder>("desc");
  const [minGames, setMinGames] = useState<number | undefined>(undefined);
  // Narrow the table to the signed-in visitor's followed players. The chip
  // sits behind `session` like the follow column, so this state can only
  // be true for someone actually signed in.
  const [followedOnly, setFollowedOnly] = useState(false);
  const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), SEARCH_DEBOUNCE_IN_MILLISECONDS);

  // Followed-only view. The profile already carries the full followed
  // player objects, so the table can narrow client-side with no ranked
  // API round trip. `followedOnly` is only honoured for a signed-in
  // visitor — the chip is hidden otherwise, and a stale `true` (say an
  // expired session) must not freeze the table on an empty roster.
  const followedPlayers = useMemo(() => me?.followedPlayers ?? [], [me]);
  const isFollowingView = followedOnly && Boolean(session);

  const teamsQuery = useQuery({ queryKey: ["teams"], queryFn: () => fetchTeams({ pageSize: 100 }) });

  // In a postseason segment the list is narrowed to players who actually
  // appeared in it (`participated`), so an eliminated team's bench doesn't
  // pad the list with players who have no figures to show. The regular
  // season is left unfiltered: essentially everyone played, so the filter
  // would only cost a join to remove nobody.
  //
  // A stat sort (anything but "name") is sent to the API, which ranks the
  // whole filtered roster before slicing the page — the first page then
  // holds the league's best, not just that page's best. minGames rides
  // along as a participation floor on the same ranking.
  const playersQuery = useQuery({
    queryKey: [
      "players",
      { page, teamId, position, search: debouncedSearchTerm, seasonType, sortKey, sortOrder, minGames },
    ],
    queryFn: () =>
      fetchPlayers({
        page,
        pageSize: PAGE_SIZE,
        teamId,
        position,
        search: debouncedSearchTerm || undefined,
        seasonType,
        ...(isPostseasonSegment ? { participated: true } : {}),
        ...(sortKey !== "name" ? { sort: sortKey } : {}),
        order: sortOrder,
        ...(minGames !== undefined ? { minGames } : {}),
      }),
    // The followed-only view builds its table from the profile's followed
    // players instead, so the ranked request stands down while it is up.
    enabled: !isFollowingView,
    // Keep the current page on screen while a new ranking or segment
    // loads — the table blurs (see the SectionLoading wrapper) instead of
    // dropping back to its first-load spinner.
    placeholderData: keepPreviousData,
  });

  // The headline figures behind the "League leaders" band. The API applies
  // a segment-appropriate participation floor (15 games in the regular
  // season, 4 in postseason segments) and echoes it back for the
  // "Minimum N games" label.
  const leadersQuery = useQuery({
    queryKey: ["playerLeaders", seasonType],
    queryFn: () => fetchPlayerLeaders(seasonType),
  });

  // One batch request for the whole page's rate columns and sparklines,
  // narrowed to the selected segment so a playoffs table shows playoff
  // figures. Rows are keyed back to their player via playerId. The
  // followed view covers its whole filtered roster rather than one page,
  // because the client-side ranking and min-games floor below read every
  // followed player's games played — the same figures back both jobs.
  // A long followed list can outgrow the batch endpoint's per-request id
  // cap, so that view fetches in chunks instead.
  const followedViewFiltered = useMemo(
    () =>
      followedPlayers.filter(
        (player) =>
          (teamId === undefined || player.teamId === teamId) &&
          (position === undefined || player.position === position) &&
          (debouncedSearchTerm === "" ||
            `${player.firstName} ${player.lastName}`
              .toLowerCase()
              .includes(debouncedSearchTerm.toLowerCase()))
      ),
    [followedPlayers, teamId, position, debouncedSearchTerm]
  );
  const statsTargetIds = isFollowingView
    ? followedViewFiltered.map((player) => player.id)
    : (playersQuery.data?.data.map((player) => player.id) ?? []);
  const statsQuery = useQuery({
    queryKey: ["playerStatsBatch", statsTargetIds, seasonType],
    queryFn: () =>
      isFollowingView
        ? fetchPlayerStatsBatchInChunks(statsTargetIds, seasonType)
        : fetchPlayerStatsBatch(statsTargetIds, seasonType),
    // An empty page must not leave the query pending forever — with no ids
    // there is nothing to fetch and nothing to draw.
    enabled: statsTargetIds.length > 0,
    // Same contract as playersQuery: previous figures stay up (blurred)
    // while the next segment or filter's batch lands.
    placeholderData: keepPreviousData,
  });

  const statsByPlayerId = useMemo(
    () => new Map((statsQuery.data?.players ?? []).map((entry) => [entry.playerId, entry])),
    [statsQuery.data]
  );

  // The followed view's pipeline mirrors what the ranked API does
  // server-side: roster filters first, then the min-games participation
  // floor, then the selected ranking (see FOLLOWED_SORT_SELECTORS).
  const followedViewQualified = useMemo(
    () =>
      minGames === undefined
        ? followedViewFiltered
        : followedViewFiltered.filter(
            (player) => (statsByPlayerId.get(player.id)?.seasonAverages.gamesPlayed ?? 0) >= minGames
          ),
    [followedViewFiltered, minGames, statsByPlayerId]
  );
  const followedViewSorted = useMemo(() => {
    if (sortKey === "name") {
      const alphabetical = [...followedViewQualified].sort(comparePlayersAlphabetically);
      return sortOrder === "asc" ? alphabetical : alphabetical.reverse();
    }
    const selectStat = FOLLOWED_SORT_SELECTORS[sortKey];
    // No-games players sink to the bottom whichever direction is chosen
    // (mirroring the API's ranked listing).
    const missingValueSink = sortOrder === "asc" ? Number.POSITIVE_INFINITY : FOLLOWED_SORT_VALUE_SINK;
    return rankPlayersByStat(
      followedViewQualified,
      (player) => {
        const averages = statsByPlayerId.get(player.id)?.seasonAverages;
        return averages && averages.gamesPlayed > 0 ? selectStat(averages) : missingValueSink;
      },
      sortOrder
    );
  }, [followedViewQualified, sortKey, sortOrder, statsByPlayerId]);

  const tablePlayers = isFollowingView
    ? followedViewSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : (playersQuery.data?.data ?? []);
  const tableTotal = isFollowingView ? followedViewSorted.length : (playersQuery.data?.total ?? 0);
  const isLoadingTable = isFollowingView
    ? statsTargetIds.length > 0 && statsQuery.isPending
    : playersQuery.isPending || (statsTargetIds.length > 0 && statsQuery.isPending);
  const columnCount = BASE_COLUMN_COUNT + (session ? 1 : 0);

  // Latched "settled once" flags — the predictions page pattern: the table
  // and leaders render their first-load spinner once, then stay mounted
  // and blur on every later refetch (segment switches, sort and filter
  // changes) instead of flashing the spinner again.
  const [hasLoadedTableOnce, setHasLoadedTableOnce] = useState(false);
  useEffect(() => {
    if (playersQuery.isSuccess || (isFollowingView && statsQuery.isSuccess)) setHasLoadedTableOnce(true);
  }, [playersQuery.isSuccess, isFollowingView, statsQuery.isSuccess]);

  const [hasLoadedLeadersOnce, setHasLoadedLeadersOnce] = useState(false);
  useEffect(() => {
    if (leadersQuery.isSuccess) setHasLoadedLeadersOnce(true);
  }, [leadersQuery.isSuccess]);

  function changeFilterAndResetPage(applyFilter: () => void) {
    applyFilter();
    setPage(1);
  }

  if (playersQuery.isError) {
    return <ErrorState message="Could not load players." onRetry={() => playersQuery.refetch()} />;
  }

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8">
        {/* Header — the page's title and its method note, the same job the
            predictions page's opening band does. */}
        <div className="mb-6 border border-landing-light bg-locker-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">Players</h1>
            {(playersQuery.data || isFollowingView) && (
              <span className="font-mono text-[10px] tracking-[0.12em] text-locker-ink-muted uppercase">
                Showing {tablePlayers.length} of {tableTotal}
              </span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-locker-ink-muted">
            Every published average below is derived from this app's own per-game boxscore rows, never lifted from
            a precomputed league total. Pick a season segment, filter the field, and open any player for the full
            picture.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <LockerSegmentControl value={seasonType} onChange={selectSeasonType} options={SEASON_TYPES_IN_ORDER} />
            <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
              {isFollowingView
                ? "Your followed players"
                : isPostseasonSegment
                  ? `Only players who appeared in the ${formatSeasonType(seasonType)}`
                  : "All players"}
            </span>
          </div>
        </div>

        {/* League leaders — one card per headline category, with the
            participation floor the API applied stated on the right. */}
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-3.5">
            <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
              League leaders
            </h2>
            <span aria-hidden className="h-px flex-1 bg-landing-light" />
            {leadersQuery.data && (
              <span className="font-mono text-[9px] tracking-[0.1em] whitespace-nowrap text-locker-ink-muted uppercase">
                Minimum {leadersQuery.data.minGames} games
              </span>
            )}
          </div>
          {leadersQuery.isPending ? (
            /* The band's pending and failure states mirror the predictions
               page's section pattern — without them the cards render
               their empty "No qualified player" face while the query is
               still in flight (or after it has failed), which reads as
               "the league has no leaders". */
            <div className="flex justify-center border border-landing-light bg-locker-surface py-8">
              <BasketballSpinner size="sm" label="Loading league leaders" />
            </div>
          ) : leadersQuery.isError ? (
            <div className="flex flex-col items-center gap-3 border border-landing-light bg-locker-surface px-4 py-8 text-center">
              <p className="text-[12.5px] text-locker-ink-muted">Could not load league leaders.</p>
              <button
                type="button"
                onClick={() => leadersQuery.refetch()}
                className="border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather"
              >
                Retry
              </button>
            </div>
          ) : (
            <SectionLoading
              loading={hasLoadedLeadersOnce && leadersQuery.isFetching}
              label="Loading league leaders"
            >
              <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            {LEADER_CATEGORIES.map((category) => {
              const leader = leadersQuery.data?.leaders[category.key] ?? null;
              return (
                <div key={category.key} className="border border-landing-light bg-locker-surface p-4">
                  <p className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                    {category.label}
                  </p>
                  <p className="mt-1 font-display text-3xl text-landing-ink tabular-nums">
                    {leader ? category.formatValue(category.selectValue(leader)) : "—"}
                  </p>
                  {leader ? (
                    <div className="mt-3 flex items-center gap-2.5">
                      {/* The name beside it is the label — an alt here would
                          double-announce it (axe image-redundant-alt). */}
                      <PlayerHeadshot player={leader.player} size="sm" className="size-12" alt="" />
                      <div className="min-w-0">
                        {/* Carries the selected segment through to the
                            profile, same contract as the table rows. */}
                        <Link
                          to={`/players/${leader.player.id}?segment=${toUrlSegment(seasonType)}`}
                          className="block truncate text-[12.5px] text-landing-ink hover:text-locker-leather"
                        >
                          {leader.player.firstName} {leader.player.lastName}
                        </Link>
                        <p className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                          {leader.player.team?.abbreviation ?? "—"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-[12.5px] text-locker-ink-muted">No qualified player</p>
                  )}
                </div>
              );
            })}
              </div>
            </SectionLoading>
          )}
        </section>

        <PlayersFilterBar
          teams={teamsQuery.data?.data ?? []}
          searchTerm={searchTerm}
          teamId={teamId}
          position={position}
          sortKey={sortKey}
          minGames={minGames}
          onSearchChange={(value) => changeFilterAndResetPage(() => setSearchTerm(value))}
          onTeamChange={(value) => changeFilterAndResetPage(() => setTeamId(value))}
          onPositionChange={(value) => changeFilterAndResetPage(() => setPosition(value))}
          onSortChange={(value) => changeFilterAndResetPage(() => setSortKey(value))}
          onMinGamesChange={(value) => changeFilterAndResetPage(() => setMinGames(value))}
          sortOrder={sortOrder}
          onSortOrderChange={(value) => changeFilterAndResetPage(() => setSortOrder(value))}
          showFollowingFilter={Boolean(session)}
          followedCount={followedPlayers.length}
          followedOnly={isFollowingView}
          onFollowedOnlyChange={(value) => changeFilterAndResetPage(() => setFollowedOnly(value))}
        />

        <SectionLoading
          loading={hasLoadedTableOnce && (playersQuery.isFetching || statsQuery.isFetching)}
          label="Loading players"
        >
          <div className="overflow-hidden border border-landing-light bg-locker-surface">
            <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-landing-light bg-landing-hero">
                {[...TABLE_HEADERS, ...(session ? (["Follow"] as const) : [])].map((header) => (
                  <th
                    key={header}
                    className="px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoadingTable ? (
                <tr>
                  <td colSpan={columnCount} className="py-10">
                    <BasketballSpinner label="Loading players" />
                  </td>
                </tr>
              ) : tablePlayers.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="px-3 py-8 text-center text-[12.5px] text-locker-ink-muted">
                    {isFollowingView
                      ? followedPlayers.length === 0
                        ? "You're not following any players yet. Use the Follow button on any player to build this list."
                        : "None of your followed players match these filters."
                      : isPostseasonSegment
                        ? `No players matched in the ${formatSeasonType(seasonType)}.`
                        : "No players found."}
                  </td>
                </tr>
              ) : (
                tablePlayers.map((player) => {
                  const entry = statsByPlayerId.get(player.id);
                  const playerName = `${player.firstName} ${player.lastName}`;
                  return (
                    <tr
                      key={player.id}
                      className="border-b border-landing-light transition-colors last:border-b-0 hover:bg-landing-hero"
                    >
                      <td className="px-3 py-2.5">
                        {/* Carries the selected segment through to the profile.
                            Without it, clicking a player from a Playoffs list
                            lands on their regular-season page — the navigation
                            silently answers a different question than the one
                            the list was asking. The headshot sits outside the
                            link (same pattern as the watchlist board): the
                            name beside it already says who this is, so the
                            photo is decorative and takes an empty alt (axe
                            image-redundant-alt). */}
                        <div className="flex items-center gap-2.5">
                          <PlayerHeadshot player={player} size="sm" className="size-8" alt="" />
                          <Link
                            to={`/players/${player.id}?segment=${toUrlSegment(seasonType)}`}
                            className="text-[12.5px] text-landing-ink hover:text-locker-leather"
                          >
                            {playerName}
                          </Link>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {player.team ? (
                          <Link
                            to={`/teams/${player.team.id}`}
                            className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.08em] text-locker-ink-muted uppercase hover:text-locker-leather"
                          >
                            <TeamBadge team={player.team} size="sm" />
                            {player.team.abbreviation}
                          </Link>
                        ) : (
                          <span className="text-locker-ink-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[10.5px] text-locker-ink-muted">
                        {player.position}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[10.5px] text-locker-ink-muted">
                        {player.jerseyNumber ? `#${player.jerseyNumber}` : "—"}
                      </td>
                      <StatCell accent entry={entry} selectValue={(averages) => averages.pointsPerGame} />
                      <StatCell entry={entry} selectValue={(averages) => averages.reboundsPerGame} />
                      <StatCell entry={entry} selectValue={(averages) => averages.assistsPerGame} />
                      <StatCell
                        entry={entry}
                        selectValue={(averages) => averages.trueShootingPercentage}
                        suffix="%"
                      />
                      <td className="px-3 py-2.5">
                        <Sparkline
                          points={(entry?.gameLog ?? []).slice(-SPARKLINE_GAME_COUNT).map((game) => game.points)}
                          label={`${playerName} points across the last ${SPARKLINE_GAME_COUNT} games`}
                        />
                      </td>
                      {session && (
                        <td className="px-3 py-2.5">
                          <FollowPlayerButton playerId={player.id} playerName={playerName} />
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </SectionLoading>

        {(playersQuery.data || isFollowingView) && (
          <Pagination
            tone="locker"
            page={page}
            pageSize={PAGE_SIZE}
            total={tableTotal}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}

interface StatCellProps {
  entry: PlayerStatsBatchEntry | undefined;
  selectValue: (averages: PlayerStatsBatchEntry["seasonAverages"]) => number;
  // The column the table is ranked on when it first opens (PPG) gets the
  // leather accent — the number the whole page is sorted by.
  accent?: boolean;
  // TS% carries a "%" suffix; the per-game rates don't.
  suffix?: string;
}

// One rate column cell. A player with no games in the segment gets an em
// dash rather than a wall of 0.0s — a zero there would be a real
// measurement, and these players simply have none.
function StatCell({ entry, selectValue, accent = false, suffix = "" }: StatCellProps) {
  const hasPlayed = (entry?.seasonAverages.gamesPlayed ?? 0) > 0;
  return (
    <td
      className={`px-3 py-2.5 font-display text-lg tabular-nums ${
        accent ? "text-locker-leather" : "text-landing-ink"
      }`}
    >
      {entry && hasPlayed ? `${selectValue(entry.seasonAverages).toFixed(1)}${suffix}` : "—"}
    </td>
  );
}
