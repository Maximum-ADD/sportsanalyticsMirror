import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminPlayByPlay, replayAdminGame, type AdminGameEvent, type SavedCorrection } from "@/lib/adminApi";
import { formatGameClock } from "@/lib/gameClock";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { ErrorState } from "@/components/ErrorState";
import { BUTTON_CLASS, INPUT_CLASS, LABEL_CLASS, PANEL_CLASS, TABLE_HEADER_CELL_CLASS } from "./adminStyles";
import type { CorrectionNameLookup } from "./correctionFormatting";
import { ADMIN_PLAY_BY_PLAY_QUERY_KEY, refreshAfterCorrection } from "./correctionQueries";
import { PlayEditForm } from "./PlayEditForm";
import { formatEventType, formatPeriod, takesMadeOrMissed } from "./playCorrection";

const PLAY_TABLE_HEADERS = [
  { label: "Qtr", className: "" },
  { label: "Clock", className: "" },
  { label: "Team", className: "hidden sm:table-cell" },
  { label: "Player", className: "" },
  { label: "Play", className: "" },
  { label: "Result", className: "hidden sm:table-cell" },
  { label: "Description", className: "hidden md:table-cell" },
  { label: "", className: "" },
];

const ALL = "";

/** "Made"/"Missed" on shots, "Off"/"Def" on rebounds, "—" otherwise. */
function formatResult(event: AdminGameEvent): string {
  if (takesMadeOrMissed(event.eventType)) return event.success === true ? "Made" : event.success === false ? "Missed" : "—";
  if (event.eventType === "rebound") return event.subType === "offensive" ? "Off" : event.subType === "defensive" ? "Def" : "—";
  return "—";
}

interface GamePlayByPlayPanelProps {
  gameId: string;
  onChangeGame: () => void;
  onCorrectionSaved: (saved: SavedCorrection) => void;
}

/**
 * The selected game: its header, a Recalculate stats action (re-derives
 * the game's stats from its plays without changing any), and every play
 * in order, filterable by quarter, player and play type, each with an
 * Edit button that opens the correction form.
 */
export function GamePlayByPlayPanel({ gameId, onChangeGame, onCorrectionSaved }: GamePlayByPlayPanelProps) {
  const queryClient = useQueryClient();
  const [editingSequence, setEditingSequence] = useState<number | null>(null);
  const [periodFilter, setPeriodFilter] = useState(ALL);
  const [playerFilter, setPlayerFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [ADMIN_PLAY_BY_PLAY_QUERY_KEY, gameId],
    queryFn: () => fetchAdminPlayByPlay(gameId),
  });
  const replayMutation = useMutation({
    mutationFn: () => replayAdminGame(gameId),
    onSuccess: () => refreshAfterCorrection(queryClient, gameId),
  });

  if (isError) return <ErrorState message="Could not load this game's plays." onRetry={() => refetch()} />;
  if (isPending) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <BasketballSpinner size="lg" label="Loading plays" />
      </div>
    );
  }

  const { game, events, roster } = data;
  const names: CorrectionNameLookup = {
    playerNames: Object.fromEntries([
      ...events.filter((event) => event.playerId && event.playerName).map((event) => [event.playerId, event.playerName]),
      ...roster.map((player) => [player.id, `${player.firstName} ${player.lastName}`]),
    ]),
    teamNames: { [game.homeTeam.id]: game.homeTeam.abbreviation, [game.awayTeam.id]: game.awayTeam.abbreviation },
  };
  const editingEvent = events.find((event) => event.sequence === editingSequence) ?? null;
  const periods = [...new Set(events.map((event) => event.period))].sort((left, right) => left - right);
  const eventTypesInGame = [...new Set(events.map((event) => event.eventType))].sort();
  const playersInGame = [...new Map(events.filter((event) => event.playerId).map((event) => [event.playerId!, event.playerName ?? event.playerId!]))]
    .sort(([, left], [, right]) => left.localeCompare(right));
  const visibleEvents = events.filter(
    (event) =>
      (periodFilter === ALL || event.period === Number(periodFilter)) &&
      (playerFilter === ALL || event.playerId === playerFilter) &&
      (typeFilter === ALL || event.eventType === typeFilter),
  );
  const hasPlayerEvents = playersInGame.length > 0;

  async function handleSaved(saved: SavedCorrection) {
    setEditingSequence(null);
    onCorrectionSaved(saved);
    await refreshAfterCorrection(queryClient, gameId);
  }

  return (
    <div className="space-y-4">
      <div className={`${PANEL_CLASS} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <div className="font-display text-lg tracking-[0.01em] text-landing-ink uppercase">
            {game.awayTeam.abbreviation} {game.awayScore ?? "—"} @ {game.homeTeam.abbreviation} {game.homeScore ?? "—"}
          </div>
          <div className="font-mono text-[10.5px] text-locker-ink-muted">
            {new Date(game.gameDate).toLocaleDateString()} · {game.season} · {events.length} events
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BUTTON_CLASS} disabled={replayMutation.isPending} onClick={() => replayMutation.mutate()}>
            {replayMutation.isPending ? "Recalculating…" : "Recalculate stats"}
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={onChangeGame}>
            Change game
          </button>
        </div>
        {replayMutation.isSuccess && (
          <p role="status" className="w-full text-[12px] text-locker-ink-muted">
            Recalculated {replayMutation.data.playersRecomputed} players' stats from this game's plays;{" "}
            {replayMutation.data.playersChanged} changed.
          </p>
        )}
        {replayMutation.isError && (
          <p role="alert" className="w-full text-[12px] text-locker-bad">
            Could not recalculate stats: {replayMutation.error.message}
          </p>
        )}
      </div>

      {!hasPlayerEvents && (
        <p className="text-[12.5px] text-locker-ink-muted">
          This game only has period markers, so there are no plays to correct. Pull its play-by-play again to correct it.
        </p>
      )}

      {editingEvent && (
        <PlayEditForm
          key={editingEvent.sequence}
          gameId={gameId}
          event={editingEvent}
          playByPlay={data}
          names={names}
          onCancel={() => setEditingSequence(null)}
          onSaved={handleSaved}
        />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className={LABEL_CLASS}>Quarter</span>
          <select className={`mt-1 block ${INPUT_CLASS}`} value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}>
            <option value={ALL}>All quarters</option>
            {periods.map((period) => (
              <option key={period} value={period}>
                {formatPeriod(period)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Player</span>
          <select className={`mt-1 block ${INPUT_CLASS}`} value={playerFilter} onChange={(event) => setPlayerFilter(event.target.value)}>
            <option value={ALL}>All players</option>
            {playersInGame.map(([playerId, playerName]) => (
              <option key={playerId} value={playerId}>
                {playerName}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Play type</span>
          <select className={`mt-1 block ${INPUT_CLASS}`} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value={ALL}>All play types</option>
            {eventTypesInGame.map((eventType) => (
              <option key={eventType} value={eventType}>
                {formatEventType(eventType)}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-2 font-mono text-[10.5px] text-locker-ink-muted">
          Showing {visibleEvents.length} of {events.length} plays
        </span>
      </div>

      <div className="max-h-[36rem] overflow-auto border border-landing-light bg-locker-surface">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-landing-hero">
            <tr className="border-b border-landing-light">
              {PLAY_TABLE_HEADERS.map((column) => (
                <th key={column.label} className={`${TABLE_HEADER_CELL_CLASS} ${column.className}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleEvents.map((event) => (
              <tr
                key={event.sequence}
                className={`border-b border-landing-light last:border-b-0 ${event.sequence === editingSequence ? "bg-landing-hero" : ""}`}
              >
                <td className="px-3 py-2 font-mono text-[11px] text-locker-ink-muted">{formatPeriod(event.period)}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-locker-ink-muted">{formatGameClock(event.clock)}</td>
                <td className="hidden px-3 py-2 font-mono text-[11px] text-locker-ink-muted sm:table-cell">
                  {event.teamId ? (names.teamNames[event.teamId] ?? "—") : "—"}
                </td>
                <td className="px-3 py-2 text-[12.5px] text-landing-ink">{event.playerName ?? "—"}</td>
                <td className="px-3 py-2 text-[12px] text-landing-ink">{formatEventType(event.eventType)}</td>
                <td className="hidden px-3 py-2 font-mono text-[11px] text-locker-ink-muted sm:table-cell">{formatResult(event)}</td>
                <td className="hidden px-3 py-2 text-[12px] text-locker-ink-muted md:table-cell">
                  {event.description}
                  {event.isCorrected && (
                    <span className="ml-2 inline-block bg-yellow-100 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] text-yellow-800 uppercase">
                      Corrected
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className={BUTTON_CLASS}
                    aria-label={`Edit play ${event.sequence}`}
                    onClick={() => setEditingSequence(event.sequence)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
