import { Link } from "react-router-dom";
import { TeamBadge } from "@/components/TeamBadge";
import { LockerSection } from "./LockerSection";
import type { FollowedTeamResult } from "./placeholderData";

interface YourTeamsListProps {
  followedTeams: string[];
  results: FollowedTeamResult[];
}

// Recent results for the teams you follow, oriented to YOUR team rather
// than the home team — that reorientation is the entire point of the
// module, and it is why this can't just be a slice of GET /v1/games.
// (That route also has no teamId filter yet; adding one is a prerequisite.)
export function YourTeamsList({ followedTeams, results }: YourTeamsListProps) {
  return (
    <LockerSection title={`Your teams · ${followedTeams.join(", ")}`}>
      <ul className="flex flex-col gap-2">
        {results.map((result) => (
          <li key={result.gameId}>
            <Link
              to={`/games/${result.gameId}`}
              className="flex flex-wrap items-center gap-3 border border-landing-light bg-locker-surface px-3.5 py-2.5 transition-colors hover:border-locker-leather focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-locker-leather"
            >
              <TeamBadge team={result.yourTeam} size="sm" />
              <span className="font-display text-[15px] tracking-[0.05em] text-landing-ink">
                {result.yourTeam.abbreviation}
              </span>
              <span className="text-xs text-locker-ink-muted">vs</span>
              <TeamBadge team={result.opponent} size="sm" />
              <span className="font-display text-[15px] tracking-[0.05em] text-landing-ink">
                {result.opponent.abbreviation}
              </span>

              <span className="ml-auto font-display text-[17px] text-landing-ink tabular-nums">
                {result.yourScore}&ndash;{result.opponentScore}
              </span>
              <span className="text-[11.5px] whitespace-nowrap text-locker-model tabular-nums">
                model: {result.modelCall}
              </span>
              {/* The letter carries the meaning; the fill only reinforces it. */}
              <span
                className={`px-2 py-px font-mono text-[10px] font-semibold tracking-[0.08em] ${
                  result.won
                    ? "bg-locker-good text-white"
                    : "border border-locker-bad text-locker-bad"
                }`}
              >
                {result.won ? "W" : "L"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </LockerSection>
  );
}
