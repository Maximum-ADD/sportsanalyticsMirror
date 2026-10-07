import { formatGameClock } from "@/lib/gameClock";
import { describePeriod } from "@/lib/liveGameDisplay";
import type { LivePlay } from "@/lib/liveGamesApi";

interface LiveRecentPlaysProps {
  /** Latest first; null when the play-by-play couldn't be read. */
  plays: LivePlay[] | null;
  regulationPeriods: number;
  awayTricode: string;
  homeTricode: string;
}

/**
 * The last five minutes of play by game clock, latest first. The window
 * crosses period breaks, so early in a quarter it also shows the end of the
 * one before (the API picks the plays; see live-game-clock.ts there).
 */
export function LiveRecentPlays({ plays, regulationPeriods, awayTricode, homeTricode }: LiveRecentPlaysProps) {
  return (
    <section aria-labelledby="live-recent-plays-heading" className="border border-landing-light bg-locker-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-landing-light px-3 py-2.5">
        <h2 id="live-recent-plays-heading" className="font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase">
          Last 5 minutes of play
        </h2>
        <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
          Score: {awayTricode}–{homeTricode}
        </span>
      </div>

      {plays === null && (
        <p className="px-3 py-4 text-[12px] text-locker-ink-muted">The play-by-play is unavailable right now.</p>
      )}
      {plays?.length === 0 && <p className="px-3 py-4 text-[12px] text-locker-ink-muted">No plays yet.</p>}
      {/* Height-capped with its own scroll: five minutes of play is often 60+
          rows once substitutions and rebounds are counted, which pushed the
          box score thousands of pixels down the page. The latest plays sit
          at the top, so the cap hides only the oldest. Focusable so keyboard
          users can scroll it too. */}
      {plays && plays.length > 0 && (
        <ol
          tabIndex={0}
          aria-label="Plays, latest first"
          className="max-h-[26rem] divide-y divide-landing-light/60 overflow-y-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-accent"
        >
          {plays.map((play) => (
            <li
              key={`${play.orderNumber}-${play.actionNumber}`}
              className="grid grid-cols-[4.5rem_2.5rem_1fr_auto] items-baseline gap-x-2 px-3 py-1.5"
            >
              <span className="font-mono text-[10.5px] text-locker-ink-muted tabular-nums">
                {describePeriod(play.period, regulationPeriods)} {formatGameClock(play.clock)}
              </span>
              <span className="font-mono text-[10px] tracking-[0.06em] text-locker-ink-muted uppercase">
                {play.teamTricode ?? ""}
              </span>
              <span className="text-[12px] text-landing-ink">{play.description}</span>
              <span
                className={`font-mono text-[11px] tabular-nums ${play.isScoringPlay ? "font-bold text-landing-ink" : "text-locker-ink-muted"}`}
              >
                {play.awayScore}–{play.homeScore}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
