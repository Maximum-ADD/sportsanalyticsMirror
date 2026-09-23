import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GameEntryRow } from "@/components/becomepro/GameEntryRow";
import {
  createProspectGame,
  deleteProspectGame,
  invalidateProspectQueries,
} from "@/lib/becomeProApi";
import { ApiError } from "@/lib/apiClient";
import { EVIDENCE_STATUS_LABELS } from "@/lib/prospectValue";
import type { ProspectGame, ProspectGameInput, ProspectSeason } from "@/types/nba";

interface SeasonEntryPanelProps {
  season: ProspectSeason;
  games: ProspectGame[];
  username: string;
}

/**
 * The owner-only half of a prospect page: the logged games, and the form that
 * adds another.
 *
 * Deliberately does NOT show a derived-season preview of its own. The profile
 * this panel sits inside already renders the server's authoritative season
 * line, and every mutation here invalidates it — so a second, locally-derived
 * copy beside it could only ever disagree with the real one, which is exactly
 * the drift lib/prospectValue.ts's deriveSeasonAverages is fenced off to avoid.
 */
export function SeasonEntryPanel({ season, games, username }: SeasonEntryPanelProps) {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (game: ProspectGameInput) => createProspectGame(season.id, game),
    onSuccess: () => {
      setSaveError(null);
      return invalidateProspectQueries(queryClient, username);
    },
    // The API's { error: { code, message } } envelope already reads as a
    // sentence (ApiError carries it through), so it is shown rather than
    // replaced with a generic line that would hide which game clashed.
    onError: (error: unknown) => {
      setSaveError(
        error instanceof ApiError ? error.message : "Couldn't save that game. Please try again."
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (gameId: string) => deleteProspectGame(gameId),
    onSuccess: () => {
      setPendingDeleteId(null);
      return invalidateProspectQueries(queryClient, username);
    },
  });

  // Newest first for the table, but the entry form's "copy last game" wants
  // the most recently played one, which is the same row.
  const gamesNewestFirst = [...games].sort((a, b) => b.gameDate.localeCompare(a.gameDate));
  const lastGame = gamesNewestFirst[0];

  return (
    <div>
      <GameEntryRow
        onSave={(game) => createMutation.mutateAsync(game)}
        isSaving={createMutation.isPending}
        lastGame={lastGame}
        errorMessage={saveError}
      />

      {games.length === 0 ? (
        <p className="mt-3 border border-dashed border-landing-light bg-landing-hero p-5 text-center text-[12.5px] text-locker-ink-muted">
          No games logged yet. Your season line is derived from these rows, so it appears as soon as
          the first one does.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <caption className="sr-only">
              Every game logged for this season, most recent first
            </caption>
            <thead>
              <tr className="border-b border-landing-light">
                {["Date", "Opponent", "MIN", "PTS", "REB", "AST", "FG", "3P", "FT", "Evidence"].map(
                  (heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="pb-1.5 font-mono text-[9px] tracking-[0.14em] text-locker-ink-muted uppercase"
                    >
                      {heading}
                    </th>
                  )
                )}
                <th scope="col" className="pb-1.5">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {gamesNewestFirst.map((game) => (
                <tr key={game.id} className="border-b border-landing-light/60">
                  <td className="py-1.5 whitespace-nowrap text-locker-ink-muted tabular-nums">
                    {game.gameDate}
                  </td>
                  <td className="py-1.5 text-landing-ink">{game.opponent}</td>
                  <td className="py-1.5 tabular-nums">{game.minutes}</td>
                  <td className="py-1.5 font-semibold tabular-nums">{game.points}</td>
                  <td className="py-1.5 tabular-nums">{game.rebounds}</td>
                  <td className="py-1.5 tabular-nums">{game.assists}</td>
                  <td className="py-1.5 whitespace-nowrap tabular-nums">
                    {game.fieldGoalsMade}-{game.fieldGoalsAttempted}
                  </td>
                  <td className="py-1.5 whitespace-nowrap tabular-nums">
                    {game.threesMade}-{game.threesAttempted}
                  </td>
                  <td className="py-1.5 whitespace-nowrap tabular-nums">
                    {game.freeThrowsMade}-{game.freeThrowsAttempted}
                  </td>
                  <td className="py-1.5 text-[10.5px] text-locker-ink-muted">
                    {game.evidenceStatus ? EVIDENCE_STATUS_LABELS[game.evidenceStatus] : "None"}
                  </td>
                  <td className="py-1.5 text-right">
                    {/* Two-click confirm, the same shape DeleteAccountControl
                        uses — deleting a game silently changes the valuation. */}
                    {pendingDeleteId === game.id ? (
                      <span className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(game.id)}
                          disabled={deleteMutation.isPending}
                          className="border border-locker-bad px-2 py-1 font-mono text-[9px] tracking-[0.1em] text-locker-bad uppercase disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(null)}
                          className="border border-landing-light px-2 py-1 font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Remove the game against ${game.opponent} on ${game.gameDate}`}
                        onClick={() => setPendingDeleteId(game.id)}
                        className="border border-landing-light px-2 py-1 font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase transition-colors hover:border-locker-bad hover:text-locker-bad"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
