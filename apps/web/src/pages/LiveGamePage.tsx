import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { Reveal } from "@/components/landing/Reveal";
import { LiveBoxScoreTable } from "@/components/live/LiveBoxScoreTable";
import { LiveRecentPlays } from "@/components/live/LiveRecentPlays";
import { LiveRefreshNote } from "@/components/live/LiveRefreshNote";
import { LiveStatusTag } from "@/components/live/LiveStatusTag";
import { TeamBadge } from "@/components/TeamBadge";
import { PageLoading } from "@/components/ui/loading-overlay";
import { ApiError } from "@/lib/apiClient";
import { describeGameTimes, LIVE_REFRESH_INTERVAL_IN_MILLISECONDS } from "@/lib/liveGameDisplay";
import { fetchLiveGame, type LiveGameDetail, type LiveGameSummary, type LiveTeamSummary } from "@/lib/liveGamesApi";
import { useCurrentTime } from "@/lib/useCurrentTime";

const HTTP_STATUS_NOT_FOUND = 404;
// Only decides whether the start and end times need a date, so once a minute will do.
const CLOCK_TICK_INTERVAL_IN_MILLISECONDS = 60_000;
// Retries for a failed load. A 404 is never retried: it means the game has
// left the live window, and asking again won't bring it back.
const MAX_LOAD_RETRIES = 2;

const BACK_LINK_CLASS =
  "mb-4 inline-flex min-h-10 items-center border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather sm:min-h-0";

function isOffTheLiveList(error: unknown): boolean {
  return error instanceof ApiError && error.status === HTTP_STATUS_NOT_FOUND;
}

// Only a live game changes from one minute to the next, so only a live one
// is polled. A finished game's figures are as final as the NBA has made them.
function selectRefreshInterval(detail: LiveGameDetail | undefined): number | false {
  return detail?.game.status === "live" ? LIVE_REFRESH_INTERVAL_IN_MILLISECONDS : false;
}

function TeamHeading({ team, align }: { team: LiveTeamSummary; align: "start" | "end" }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${align === "end" ? "items-end text-right" : "items-start"}`}>
      <TeamBadge team={{ abbreviation: team.tricode, nbaTeamId: team.teamId }} />
      <span className="font-display text-lg tracking-[0.01em] text-landing-ink uppercase">{team.tricode}</span>
      <span className="text-[11.5px] text-locker-ink-muted">
        {team.city} {team.name}
      </span>
    </div>
  );
}

interface LiveScoreboardProps {
  game: LiveGameSummary;
  refreshNote: ReactNode;
  nowEpochMilliseconds: number;
}

function LiveScoreboard({ game, refreshNote, nowEpochMilliseconds }: LiveScoreboardProps) {
  const { awayTeam, homeTeam } = game;
  return (
    <div className="mb-5 border border-landing-light bg-locker-surface p-4 sm:p-6">
      <h1 className="sr-only">
        {awayTeam.city} {awayTeam.name} at {homeTeam.city} {homeTeam.name}
      </h1>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LiveStatusTag game={game} />
        {game.seasonType && (
          <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">{game.seasonType}</span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamHeading team={awayTeam} align="start" />
        <p className="font-display text-3xl whitespace-nowrap text-landing-ink tabular-nums sm:text-5xl">
          {awayTeam.score}
          <span className="mx-2 text-locker-ink-muted sm:mx-4">–</span>
          {homeTeam.score}
        </p>
        <TeamHeading team={homeTeam} align="end" />
      </div>

      <div className="mt-5 space-y-1.5 border-t border-landing-light pt-3">
        <p className="font-mono text-[10px] tracking-[0.08em] text-locker-ink-muted uppercase">
          {describeGameTimes(game, nowEpochMilliseconds)} · Stats from the NBA's live feed
        </p>
        {refreshNote}
      </div>
    </div>
  );
}

function OffTheListNotice() {
  return (
    <div className="flex min-h-full items-center justify-center bg-landing-hero">
      <section className="mx-auto flex max-w-lg flex-col items-center gap-4 border border-landing-light bg-locker-surface px-8 py-10 text-center">
        <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">Not on the live page</h1>
        <p className="text-[12.5px] text-locker-ink-muted">
          This game isn't live and didn't finish in the last 18 hours, so there's no live box score for it. Games
          that haven't started yet get one at tip-off.
        </p>
        <Link to="/live" className={BACK_LINK_CLASS}>
          See live games
        </Link>
      </section>
    </div>
  );
}

/**
 * One game from the Live tab: the scoreboard, the last five minutes of play
 * while it's live, and the box score split by team (side by side on wide
 * screens, stacked on narrow ones). Stats are the NBA's own.
 */
export function LiveGamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const nowEpochMilliseconds = useCurrentTime(CLOCK_TICK_INTERVAL_IN_MILLISECONDS);
  const liveGameQuery = useQuery({
    queryKey: ["liveGame", gameId],
    queryFn: () => fetchLiveGame(gameId!),
    enabled: !!gameId,
    refetchInterval: (query) => selectRefreshInterval(query.state.data),
    retry: (failureCount, error) => !isOffTheLiveList(error) && failureCount < MAX_LOAD_RETRIES,
  });

  if (!liveGameQuery.data) {
    if (isOffTheLiveList(liveGameQuery.error)) return <OffTheListNotice />;
    if (liveGameQuery.isError) {
      return <ErrorState message="Live NBA data is unavailable right now." onRetry={() => liveGameQuery.refetch()} />;
    }
    return (
      <div className="min-h-full bg-landing-hero p-4 sm:p-6">
        <PageLoading label="Loading game" />
      </div>
    );
  }

  const { game, homePlayers, awayPlayers, recentPlays } = liveGameQuery.data;
  const refreshNote = (
    <LiveRefreshNote
      updatedAtEpochMilliseconds={liveGameQuery.dataUpdatedAt}
      hasRefreshFailed={liveGameQuery.isRefetchError}
      refreshIntervalInMilliseconds={selectRefreshInterval(liveGameQuery.data)}
    />
  );

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <Link to="/live" className={BACK_LINK_CLASS}>
          ← Live games
        </Link>

        <Reveal>
          <LiveScoreboard game={game} refreshNote={refreshNote} nowEpochMilliseconds={nowEpochMilliseconds} />
        </Reveal>

        {game.status === "live" && (
          <Reveal className="mb-5">
            <LiveRecentPlays
              plays={recentPlays}
              regulationPeriods={game.regulationPeriods}
              awayTricode={game.awayTeam.tricode}
              homeTricode={game.homeTeam.tricode}
            />
          </Reveal>
        )}

        <Reveal>
          <h2 className="mb-3 font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase">Box score</h2>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <LiveBoxScoreTable team={game.awayTeam} players={awayPlayers} />
            <LiveBoxScoreTable team={game.homeTeam} players={homePlayers} />
          </div>
        </Reveal>
      </div>
    </div>
  );
}
