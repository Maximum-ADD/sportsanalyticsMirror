import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { fetchEloRatings, fetchTeamRecords, fetchTeams } from "@/lib/nbaApi";
import { PageLoading, SectionLoading } from "@/components/ui/loading-overlay";
import { ErrorState } from "@/components/ErrorState";
import { FollowTeamButton } from "@/components/FollowTeamButton";
import { Pagination } from "@/components/Pagination";
import { Reveal } from "@/components/landing/Reveal";
import { TeamBadge } from "@/components/TeamBadge";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMe } from "@/lib/useMe";
import type { Team, TeamEloRating, TeamRecord } from "@/types/nba";

// All 30 current franchises fit in one request (see the ingestion's own
// "all 30 current teams" doc comment) — fetched once, then searched,
// filtered, sorted, and paged entirely client-side, the same trade the
// player leaderboard makes for its smaller reference lists. This also
// keeps the records/elo endpoints (both whole-league reads) trivially
// joinable by team id without a second round of server-side filtering.
const TEAM_COUNT = 30;
const PAGE_SIZE = 9;
const SEARCH_DEBOUNCE_IN_MILLISECONDS = 300;

type SortKey = "elo" | "winPct" | "name";

const CONFERENCES = ["East", "West"];
const DIVISIONS = ["Atlantic", "Central", "Southeast", "Northwest", "Pacific", "Southwest"];

const FILTER_CHIP_CLASS =
  "border border-landing-light bg-landing-hero px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] text-landing-ink uppercase focus:outline-none";

function matchesSearch(team: Team, search: string): boolean {
  if (!search) return true;
  const haystack = `${team.city} ${team.name} ${team.abbreviation}`.toLowerCase();
  return haystack.includes(search.toLowerCase());
}

interface TeamRow {
  team: Team;
  elo: number | null;
  record: TeamRecord | null;
}

function sortRows(rows: TeamRow[], sortKey: SortKey): TeamRow[] {
  const sorted = [...rows];
  switch (sortKey) {
    case "elo":
      return sorted.sort((a, b) => (b.elo ?? -Infinity) - (a.elo ?? -Infinity));
    case "winPct":
      return sorted.sort((a, b) => (b.record?.winPercentage ?? -1) - (a.record?.winPercentage ?? -1));
    case "name":
      return sorted.sort((a, b) => `${a.team.city} ${a.team.name}`.localeCompare(`${b.team.city} ${b.team.name}`));
  }
}

function RecentFormPills({ recentForm }: { recentForm: TeamRecord["recentForm"] }) {
  if (recentForm.length === 0) return null;
  return (
    <div className="flex gap-1">
      {recentForm.map((result, index) => (
        <span
          key={index}
          className={`flex size-4 items-center justify-center font-mono text-[8px] font-bold text-white ${
            result === "W" ? "bg-locker-good" : "bg-locker-bad"
          }`}
        >
          {result}
        </span>
      ))}
    </div>
  );
}

function TeamCard({ team, elo, record }: TeamRow) {
  const { data: me } = useMe();
  const isFollowing = me?.favoriteTeam?.id === team.id;

  return (
    <Link key={team.id} to={`/teams/${team.id}`} className="group block">
      <div className="h-full border border-landing-light bg-locker-surface p-4 transition-colors group-hover:border-locker-leather">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <TeamBadge team={team} />
            <div>
              <div className="font-display text-base tracking-[0.01em] text-landing-ink uppercase">
                {team.city} {team.name}
              </div>
              <div className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                {team.conference} · {team.division}
              </div>
            </div>
          </div>
          <FollowTeamButton teamId={team.id} teamName={`${team.city} ${team.name}`} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-landing-light pt-3">
          <div>
            <div className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">Record</div>
            <div className="font-display text-sm text-landing-ink tabular-nums">
              {record ? `${record.wins}–${record.losses}` : "—"}
            </div>
          </div>
          <div>
            <div className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">Win %</div>
            <div className="font-display text-sm text-landing-ink tabular-nums">
              {record?.winPercentage !== null && record?.winPercentage !== undefined
                ? `${Math.round(record.winPercentage * 100)}%`
                : "—"}
            </div>
          </div>
          <div>
            <div className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">Elo</div>
            <div className="font-display text-sm text-locker-leather tabular-nums">
              {elo !== null ? Math.round(elo) : "—"}
            </div>
          </div>
        </div>

        {record && record.recentForm.length > 0 && (
          <div className="mt-3">
            <RecentFormPills recentForm={record.recentForm} />
          </div>
        )}

        {isFollowing && (
          <div className="mt-3 font-mono text-[9px] tracking-[0.1em] text-locker-leather uppercase">
            ★ Following
          </div>
        )}
      </div>
    </Link>
  );
}

export function TeamsListPage() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [conference, setConference] = useState<string | undefined>();
  const [division, setDivision] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<SortKey>("elo");
  const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), SEARCH_DEBOUNCE_IN_MILLISECONDS);

  const teamsQuery = useQuery({
    queryKey: ["teams", "all"],
    queryFn: () => fetchTeams({ page: 1, pageSize: TEAM_COUNT }),
  });
  const eloQuery = useQuery({ queryKey: ["teamEloRatings"], queryFn: fetchEloRatings });
  const recordsQuery = useQuery({ queryKey: ["teamRecords"], queryFn: fetchTeamRecords });

  const isPending = teamsQuery.isPending || eloQuery.isPending || recordsQuery.isPending;
  const isError = teamsQuery.isError || eloQuery.isError || recordsQuery.isError;
  const hasLoadedOnce = !isPending || isError;

  const eloByTeamId = useMemo(() => {
    const map = new Map<string, TeamEloRating>();
    for (const rating of eloQuery.data ?? []) map.set(rating.team.id, rating);
    return map;
  }, [eloQuery.data]);

  const recordByTeamId = useMemo(() => {
    const map = new Map<string, TeamRecord>();
    for (const record of recordsQuery.data ?? []) map.set(record.teamId, record);
    return map;
  }, [recordsQuery.data]);

  const filteredRows = useMemo(() => {
    const teams = teamsQuery.data?.data ?? [];
    const rows: TeamRow[] = teams
      .filter((team) => matchesSearch(team, debouncedSearchTerm))
      .filter((team) => !conference || team.conference === conference)
      .filter((team) => !division || team.division === division)
      .map((team) => ({
        team,
        elo: eloByTeamId.get(team.id)?.elo ?? null,
        record: recordByTeamId.get(team.id) ?? null,
      }));
    return sortRows(rows, sortKey);
  }, [teamsQuery.data, debouncedSearchTerm, conference, division, sortKey, eloByTeamId, recordByTeamId]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const visibleRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);

  function changeSearch(search: string) {
    setSearchTerm(search);
    setPage(1);
  }

  function changeConference(value: string | undefined) {
    setConference(value);
    setPage(1);
  }

  function changeDivision(value: string | undefined) {
    setDivision(value);
    setPage(1);
  }

  if (isError) {
    return <ErrorState message="Could not load teams." onRetry={() => { teamsQuery.refetch(); eloQuery.refetch(); recordsQuery.refetch(); }} />;
  }

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8">
        <Reveal>
          <div className="mb-6 border border-landing-light bg-locker-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">Teams</h1>
                <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-locker-ink-muted">
                  All 30 franchises, with the record and Elo rating the predictor actually uses. Elo is the same
                  pre-game figure stored on every GamePrediction row, so what you see here is what the model saw.
                </p>
              </div>
              {filteredRows.length > 0 && (
                <span className="font-mono text-[10px] tracking-[0.12em] text-locker-ink-muted uppercase">
                  Showing {Math.min(visibleRows.length, filteredRows.length)} of {filteredRows.length}
                </span>
              )}
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="mb-5 flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 border border-landing-light bg-landing-hero px-2.5 py-1.5">
              <Search aria-hidden className="size-3.5 text-locker-ink-muted" />
              <input
                type="search"
                aria-label="Search teams"
                className="w-44 bg-transparent text-[12.5px] text-landing-ink placeholder:text-locker-ink-muted focus:outline-none"
                placeholder="Search teams"
                value={searchTerm}
                onChange={(event) => changeSearch(event.target.value)}
              />
            </div>

            <select
              aria-label="Filter teams by conference"
              className={FILTER_CHIP_CLASS}
              value={conference ?? ""}
              onChange={(event) => changeConference(event.target.value || undefined)}
            >
              <option value="">All conferences</option>
              {CONFERENCES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter teams by division"
              className={FILTER_CHIP_CLASS}
              value={division ?? ""}
              onChange={(event) => changeDivision(event.target.value || undefined)}
            >
              <option value="">All divisions</option>
              {DIVISIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              aria-label="Sort teams"
              className={FILTER_CHIP_CLASS}
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              <option value="elo">Sort: Elo rating</option>
              <option value="winPct">Sort: Win %</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>
        </Reveal>

        {!hasLoadedOnce ? (
          <PageLoading label="Loading teams" />
        ) : (
          <Reveal>
            <SectionLoading loading={teamsQuery.isFetching || eloQuery.isFetching || recordsQuery.isFetching}>
              {visibleRows.length === 0 ? (
                <p className="text-[12.5px] text-locker-ink-muted">No teams found.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleRows.map((row) => (
                    <TeamCard key={row.team.id} {...row} />
                  ))}
                </div>
              )}
            </SectionLoading>
          </Reveal>
        )}

        {filteredRows.length > 0 && (
          <Pagination tone="locker" page={page} pageSize={PAGE_SIZE} total={filteredRows.length} onPageChange={setPage} />
        )}
      </div>
    </div>
  );
}
