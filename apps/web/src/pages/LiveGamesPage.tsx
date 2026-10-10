import { useId, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/ErrorState";
import { Reveal } from "@/components/landing/Reveal";
import { LiveGameCard } from "@/components/live/LiveGameCard";
import { LiveRefreshNote } from "@/components/live/LiveRefreshNote";
import { UpcomingGameCard } from "@/components/live/UpcomingGameCard";
import { PageLoading } from "@/components/ui/loading-overlay";
import { LIVE_GAMES_QUERY_KEY, selectBoardRefreshInterval, SOUTH_AFRICA_TIME_ZONE_LABEL } from "@/lib/liveGameDisplay";
import { fetchLiveGames, type LiveGamesBoard } from "@/lib/liveGamesApi";
import { useCurrentTime } from "@/lib/useCurrentTime";

// Countdowns show whole minutes, so half a minute is fresh enough.
const COUNTDOWN_TICK_INTERVAL_IN_MILLISECONDS = 30_000;

interface LiveGamesSectionProps {
  title: string;
  gameCount: number;
  emptyMessage: string;
  children: ReactNode;
}

// One of the page's three sections. Shown even when empty, so "nothing live
// right now" reads as an answer rather than as a page that failed to load.
function LiveGamesSection({ title, gameCount, emptyMessage, children }: LiveGamesSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="mb-8">
      <h2 id={headingId} className="mb-3 flex items-baseline gap-2 font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase">
        {title}{" "}
        <span className="font-mono text-[10px] tracking-[0.1em]">({gameCount})</span>
      </h2>
      {gameCount === 0 ? (
        <p className="border border-landing-light bg-locker-surface px-4 py-5 text-[12.5px] text-locker-ink-muted">{emptyMessage}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>
      )}
    </section>
  );
}

function LiveGamesSections({ board, nowEpochMilliseconds }: { board: LiveGamesBoard; nowEpochMilliseconds: number }) {
  return (
    <>
      <LiveGamesSection title="Live" gameCount={board.live.length} emptyMessage="Nothing is live right now.">
        {board.live.map((game) => (
          <li key={game.gameId}>
            <LiveGameCard game={game} nowEpochMilliseconds={nowEpochMilliseconds} />
          </li>
        ))}
      </LiveGamesSection>
      <LiveGamesSection title="Upcoming" gameCount={board.upcoming.length} emptyMessage="No games in the next 24 hours.">
        {board.upcoming.map((game) => (
          <li key={game.gameId}>
            <UpcomingGameCard game={game} nowEpochMilliseconds={nowEpochMilliseconds} />
          </li>
        ))}
      </LiveGamesSection>
      <LiveGamesSection title="Recent" gameCount={board.recent.length} emptyMessage="No games finished in the last 18 hours.">
        {board.recent.map((game) => (
          <li key={game.gameId}>
            <LiveGameCard game={game} nowEpochMilliseconds={nowEpochMilliseconds} />
          </li>
        ))}
      </LiveGamesSection>
    </>
  );
}

/**
 * The Live tab: NBA games in three sections, preseason included. Live (in
 * progress), Upcoming (starting within 24 hours, with a countdown) and
 * Recent (finished within 18 hours). A bonus feature outside the platform's
 * core scope, so the page says plainly that its stats come from the NBA
 * rather than from this platform's own event data.
 */
export function LiveGamesPage() {
  const nowEpochMilliseconds = useCurrentTime(COUNTDOWN_TICK_INTERVAL_IN_MILLISECONDS);
  const liveGamesQuery = useQuery({
    queryKey: LIVE_GAMES_QUERY_KEY,
    queryFn: fetchLiveGames,
    refetchInterval: (query) => selectBoardRefreshInterval(query.state.data),
  });

  if (!liveGamesQuery.data && liveGamesQuery.isError) {
    return (
      <ErrorState
        message="Live NBA data is unavailable right now. The NBA's feed may be down; try again in a minute."
        onRetry={() => liveGamesQuery.refetch()}
      />
    );
  }

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mb-6 border border-landing-light bg-locker-surface p-4 sm:p-6">
            <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">Live games</h1>
            <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-locker-ink-muted">
              Games in progress, games starting in the next 24 hours, and games that finished in the last 18 hours,
              preseason included. Scores and stats come straight from the NBA's live feed: they aren't derived from
              this platform's event data, and none of it is stored. Times are South African ({SOUTH_AFRICA_TIME_ZONE_LABEL}).
            </p>
            {liveGamesQuery.data && (
              <div className="mt-3">
                <LiveRefreshNote
                  updatedAtEpochMilliseconds={liveGamesQuery.dataUpdatedAt}
                  hasRefreshFailed={liveGamesQuery.isRefetchError}
                  refreshIntervalInMilliseconds={selectBoardRefreshInterval(liveGamesQuery.data)}
                />
              </div>
            )}
          </div>
        </Reveal>

        {liveGamesQuery.data ? (
          <LiveGamesSections board={liveGamesQuery.data} nowEpochMilliseconds={nowEpochMilliseconds} />
        ) : (
          <PageLoading label="Loading live games" />
        )}
      </div>
    </div>
  );
}
