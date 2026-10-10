import { describeUpcomingState, formatSouthAfricanTime, SOUTH_AFRICA_TIME_ZONE_LABEL, STARTING_SOON_LABEL } from "@/lib/liveGameDisplay";
import type { UpcomingLiveGame } from "@/lib/liveGamesApi";
import { LiveTeamRow } from "./LiveTeamRow";

interface UpcomingGameCardProps {
  game: UpcomingLiveGame;
  /** The current time, for the countdown and whether the tip-off needs a date. */
  nowEpochMilliseconds: number;
}

// The state line's tone: the NBA's note on a game that's off track ("PPD")
// stands out most, "Starting soon" a little, a countdown not at all.
function selectStateClass(game: UpcomingLiveGame, stateText: string): string {
  if (game.statusNote !== null) return "text-locker-bad";
  return stateText === STARTING_SOON_LABEL ? "text-locker-leather" : "text-landing-ink";
}

/**
 * A game due to start within 24 hours: both teams, an "Upcoming" tag (outlined,
 * so it never reads as Live), a countdown to tip-off and the tip-off time.
 * No score, quarter or clock: there are none yet. Not a link, because there's
 * no box score to open until the game starts.
 */
export function UpcomingGameCard({ game, nowEpochMilliseconds }: UpcomingGameCardProps) {
  const stateText = describeUpcomingState(game, nowEpochMilliseconds);

  return (
    <article className="h-full border border-landing-light bg-locker-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] uppercase">
          <span className="border border-locker-model px-1.5 py-0.5 text-locker-model">Upcoming</span>
          <span className={`tabular-nums ${selectStateClass(game, stateText)}`}>{stateText}</span>
        </span>
        {game.seasonType && (
          <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">{game.seasonType}</span>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <LiveTeamRow team={game.awayTeam} />
        <LiveTeamRow team={game.homeTeam} />
      </div>

      <p className="mt-4 border-t border-landing-light pt-3 font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
        Tip-off {formatSouthAfricanTime(game.startsAt, nowEpochMilliseconds)} {SOUTH_AFRICA_TIME_ZONE_LABEL}
      </p>
    </article>
  );
}
