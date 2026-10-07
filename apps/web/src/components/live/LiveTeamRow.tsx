import { TeamBadge } from "@/components/TeamBadge";

interface LiveTeamRowProps {
  team: { teamId: number; tricode: string; name: string };
  /** Left out for a game that hasn't started. */
  score?: number;
  /** Dims the score: the loser of a finished game. */
  isScoreMuted?: boolean;
}

/** One team's line on a live page card: logo, code and name, then the score if there is one. */
export function LiveTeamRow({ team, score, isScoreMuted = false }: LiveTeamRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <TeamBadge team={{ abbreviation: team.tricode, nbaTeamId: team.teamId }} size="sm" className="size-7" />
        <span className="font-display text-base tracking-[0.01em] text-landing-ink uppercase">{team.tricode}</span>
        <span className="truncate text-[11.5px] text-locker-ink-muted">{team.name}</span>
      </div>
      {score !== undefined && (
        <span className={`font-display text-2xl tabular-nums ${isScoreMuted ? "text-locker-ink-muted" : "text-landing-ink"}`}>
          {score}
        </span>
      )}
    </div>
  );
}
