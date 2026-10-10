import { Link } from "react-router-dom";
import { describeGameTimes } from "@/lib/liveGameDisplay";
import type { LiveGameSummary } from "@/lib/liveGamesApi";
import { LiveStatusTag } from "./LiveStatusTag";
import { LiveTeamRow } from "./LiveTeamRow";

interface LiveGameCardProps {
  game: LiveGameSummary;
  /** The current time, which decides whether the times need a date. */
  nowEpochMilliseconds: number;
}

/**
 * A live or recently finished game on the live page: both teams with their
 * scores (away team on top, as "away @ home" reads), where the game stands,
 * and its start and end times. Links to the game's box score.
 */
export function LiveGameCard({ game, nowEpochMilliseconds }: LiveGameCardProps) {
  const isFinal = game.status === "final";
  const { awayTeam, homeTeam } = game;

  return (
    <Link to={`/live/${game.gameId}`} className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent">
      <article className="h-full border border-landing-light bg-locker-surface p-4 transition-colors group-hover:border-locker-leather">
        <div className="flex items-center justify-between gap-2">
          <LiveStatusTag game={game} />
          {game.seasonType && (
            <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">{game.seasonType}</span>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <LiveTeamRow team={awayTeam} score={awayTeam.score} isScoreMuted={isFinal && awayTeam.score < homeTeam.score} />
          <LiveTeamRow team={homeTeam} score={homeTeam.score} isScoreMuted={isFinal && homeTeam.score < awayTeam.score} />
        </div>

        <p className="mt-4 border-t border-landing-light pt-3 font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
          {describeGameTimes(game, nowEpochMilliseconds)}
        </p>
      </article>
    </Link>
  );
}
