import { describeFinish, describeLiveState } from "@/lib/liveGameDisplay";
import type { LiveGameSummary } from "@/lib/liveGamesApi";

interface LiveStatusTagProps {
  game: Pick<LiveGameSummary, "status" | "period" | "regulationPeriods" | "gameClock" | "statusText">;
}

/**
 * A game's state in one line: a red "Live" tag with the quarter and time
 * left while it's on, or how it ended ("Final", "Final/OT") once it's over.
 */
export function LiveStatusTag({ game }: LiveStatusTagProps) {
  if (game.status === "final") {
    return (
      <span className="font-mono text-[10px] tracking-[0.14em] text-locker-ink-muted uppercase">
        {describeFinish(game.period, game.regulationPeriods)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] uppercase">
      <span className="inline-flex items-center gap-1.5 bg-locker-bad px-1.5 py-0.5 text-white">
        <span aria-hidden className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" />
        Live
      </span>
      <span className="text-landing-ink tabular-nums">{describeLiveState(game)}</span>
    </span>
  );
}
