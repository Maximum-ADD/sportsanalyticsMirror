import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminGames } from "@/lib/adminApi";
import { fetchSeasons, fetchTeams } from "@/lib/nbaApi";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import { BUTTON_CLASS, INPUT_CLASS, LABEL_CLASS, PAGE_SIZE, TABLE_HEADER_CELL_CLASS } from "./adminStyles";
import { ADMIN_GAMES_QUERY_KEY } from "./correctionQueries";

// A game with fewer events than this holds only period markers (games
// ingested before real play-by-play); a real game has ~450-550.
const MIN_PLAY_BY_PLAY_EVENTS = 20;

const GAME_TABLE_HEADERS = ["Date", "Matchup", "Score", "Plays", "Corrections", ""];

/**
 * Finds the game to correct: filter by season, team and date window, then
 * pick one. Each game shows how many events it holds, so a game with only
 * period markers (nothing to correct) is obvious before opening it.
 */
export function CorrectionGamePicker({ onSelectGame }: { onSelectGame: (gameId: string) => void }) {
  const [season, setSeason] = useState("");
  const [teamId, setTeamId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const seasonsQuery = useQuery({ queryKey: ["seasons"], queryFn: () => fetchSeasons() });
  const teamsQuery = useQuery({ queryKey: ["teams"], queryFn: () => fetchTeams({ pageSize: 100 }) });
  const filters = { season: season || undefined, teamId: teamId || undefined, fromDate: fromDate || undefined, toDate: toDate || undefined };
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [ADMIN_GAMES_QUERY_KEY, { ...filters, page }],
    queryFn: () => fetchAdminGames({ ...filters, page, pageSize: PAGE_SIZE }),
  });

  /** Returns a setter that also goes back to page 1, since the results change. */
  function resettingPage(setFilter: (value: string) => void) {
    return (value: string) => {
      setFilter(value);
      setPage(1);
    };
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className={LABEL_CLASS}>Season</span>
          <select className={`mt-1 block ${INPUT_CLASS}`} value={season} onChange={(event) => resettingPage(setSeason)(event.target.value)}>
            <option value="">All seasons</option>
            {seasonsQuery.data?.map((seasonName) => (
              <option key={seasonName} value={seasonName}>
                {seasonName}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Team</span>
          <select className={`mt-1 block ${INPUT_CLASS}`} value={teamId} onChange={(event) => resettingPage(setTeamId)(event.target.value)}>
            <option value="">All teams</option>
            {teamsQuery.data?.data.map((team) => (
              <option key={team.id} value={team.id}>
                {team.city} {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>From</span>
          <input type="date" className={`mt-1 block ${INPUT_CLASS}`} value={fromDate} onChange={(event) => resettingPage(setFromDate)(event.target.value)} />
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>To</span>
          <input type="date" className={`mt-1 block ${INPUT_CLASS}`} value={toDate} onChange={(event) => resettingPage(setToDate)(event.target.value)} />
        </label>
      </div>

      {isError ? (
        <ErrorState message="Could not load games." onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="flex min-h-40 items-center justify-center">
          <BasketballSpinner size="lg" label="Loading games" />
        </div>
      ) : (
        <div className="overflow-x-auto border border-landing-light bg-locker-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-landing-light bg-landing-hero">
                {GAME_TABLE_HEADERS.map((header) => (
                  <th key={header} className={TABLE_HEADER_CELL_CLASS}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.length === 0 ? (
                <tr>
                  <td colSpan={GAME_TABLE_HEADERS.length} className="px-3 py-8 text-center text-[12.5px] text-locker-ink-muted">
                    No games match these filters.
                  </td>
                </tr>
              ) : (
                data.data.map((game) => {
                  const hasPlayByPlay = game.eventCount >= MIN_PLAY_BY_PLAY_EVENTS;
                  return (
                    <tr key={game.id} className="border-b border-landing-light last:border-b-0">
                      <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap text-locker-ink-muted">
                        {new Date(game.gameDate).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-[13px] text-landing-ink">
                          {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                        </div>
                        <div className="font-mono text-[10px] text-locker-ink-muted">{game.season}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">
                        {game.awayScore ?? "—"}–{game.homeScore ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">
                        {game.eventCount}
                        {!hasPlayByPlay && <span className="ml-1.5 text-[10px]">(markers only)</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">{game.correctionCount}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button type="button" className={BUTTON_CLASS} onClick={() => onSelectGame(game.id)}>
                          Open plays
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pagination tone="locker" page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
    </div>
  );
}
