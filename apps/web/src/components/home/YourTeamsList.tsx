import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/apiClient";
import { fetchTeamResults } from "@/lib/nbaApi";
import { useMe } from "@/lib/useMe";
import { TeamBadge } from "@/components/TeamBadge";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { LockerSection } from "./LockerSection";
import type { OrientedModelCall, TeamResult } from "@/types/nba";

const UNAUTHENTICATED_STATUS = 401;

const PERCENT = (value: number) => `${Math.round(value * 100)}%`;

/**
 * Recent results for the team the user supports, told from THEIR side.
 *
 * Reads GET /v1/me/teams/results. That reorientation is the entire reason the
 * route exists and why this is not a slice of /v1/games: the same rows there
 * are only ever home-vs-away, so "did we win" would have to be re-derived in
 * the browser for every game, and the model's home-team probability flipped
 * by hand. The server does both, once, and says which side it is speaking
 * from.
 *
 * The team itself comes from User.favoriteTeamId, which onboarding sets.
 */
export function YourTeamsList() {
  const { data: me } = useMe();

  const resultsQuery = useQuery({
    queryKey: ["teamResults"],
    queryFn: fetchTeamResults,
    // Signed out is a state, not a fault.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === UNAUTHENTICATED_STATUS) && failureCount < 2,
  });

  const favoriteTeam = me?.favoriteTeam ?? null;
  const title = favoriteTeam ? `Your team · ${favoriteTeam.city} ${favoriteTeam.name}` : "Your team";

  if (resultsQuery.isPending) {
    return (
      <LockerSection title={title}>
        <div className="flex min-h-24 items-center justify-center border border-landing-light bg-locker-surface">
          <BasketballSpinner label="Loading recent results" />
        </div>
      </LockerSection>
    );
  }

  const error = resultsQuery.error;

  if (error instanceof ApiError && error.status === UNAUTHENTICATED_STATUS) {
    return (
      <LockerSection title={title}>
        <p className="border border-dashed border-landing-light bg-locker-surface p-5 text-center text-[12.5px] text-locker-ink-muted">
          Sign in and pick a team, and its recent results land here — told from your side, with what the model
          had said about each one.
        </p>
      </LockerSection>
    );
  }

  if (resultsQuery.isError || !resultsQuery.data) {
    return (
      <LockerSection title={title}>
        <div className="border border-landing-light bg-locker-surface p-5">
          <p className="text-[12.5px] text-locker-bad">Could not load recent results.</p>
          <button
            type="button"
            onClick={() => resultsQuery.refetch()}
            className="mt-2 text-[12.5px] text-locker-leather underline underline-offset-[3px]"
          >
            Try again
          </button>
        </div>
      </LockerSection>
    );
  }

  const results = resultsQuery.data.data;

  // An empty feed has two quite different causes, and saying the wrong one is
  // worse than saying nothing: no team chosen yet, versus a team whose games
  // have not been ingested.
  if (results.length === 0) {
    return (
      <LockerSection title={title}>
        <p className="border border-dashed border-landing-light bg-locker-surface p-5 text-center text-[12.5px] text-locker-ink-muted">
          {favoriteTeam ? (
            <>No completed games on record for {favoriteTeam.name} yet.</>
          ) : (
            <>
              Pick a team on{" "}
              <Link to="/profile" className="text-locker-leather underline underline-offset-[3px]">
                your profile
              </Link>{" "}
              and its results show up here.
            </>
          )}
        </p>
      </LockerSection>
    );
  }

  return (
    <LockerSection title={title}>
      <ul className="flex flex-col gap-2">
        {results.map((result) => (
          <li key={result.gameId}>
            <ResultRow result={result} />
          </li>
        ))}
      </ul>
    </LockerSection>
  );
}

function ResultRow({ result }: { result: TeamResult }) {
  return (
    <Link
      to={`/games/${result.gameId}`}
      className="flex flex-wrap items-center gap-3 border border-landing-light bg-locker-surface px-3.5 py-2.5 transition-colors hover:border-locker-leather focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-locker-leather"
    >
      <TeamBadge
        team={{ abbreviation: result.yourTeam.abbreviation, nbaTeamId: result.yourTeam.nbaTeamId }}
        size="sm"
      />
      <span className="font-display text-[15px] tracking-[0.05em] text-landing-ink">
        {result.yourTeam.abbreviation}
      </span>
      {/* "vs" and "at" are not decoration — they are the only thing telling
          the reader whether this was a home game, now that the row no longer
          leads with the home side. */}
      <span className="text-xs text-locker-ink-muted">{result.playedAtHome ? "vs" : "at"}</span>
      <TeamBadge
        team={{ abbreviation: result.opponent.abbreviation, nbaTeamId: result.opponent.nbaTeamId }}
        size="sm"
      />
      <span className="font-display text-[15px] tracking-[0.05em] text-landing-ink">
        {result.opponent.abbreviation}
      </span>

      <span className="ml-auto font-display text-[17px] text-landing-ink tabular-nums">
        {result.yourScore}&ndash;{result.opponentScore}
      </span>

      <ModelCallNote call={result.modelCall} teamAbbreviation={result.yourTeam.abbreviation} />

      {/* The letter carries the meaning; the fill only reinforces it. */}
      <span
        className={`px-2 py-px font-mono text-[10px] font-semibold tracking-[0.08em] ${
          result.won ? "bg-locker-good text-white" : "border border-locker-bad text-locker-bad"
        }`}
      >
        {result.won ? "W" : "L"}
      </span>
    </Link>
  );
}

/**
 * What the model said about this game, before it was played.
 *
 * Renders nothing at all when there is no prediction on record. An absent
 * prediction is not a 50/50 call, and printing one would invent a forecast
 * the pipeline never made.
 */
function ModelCallNote({
  call,
  teamAbbreviation,
}: {
  call: OrientedModelCall | null;
  teamAbbreviation: string;
}) {
  if (!call) {
    return <span className="text-[11.5px] whitespace-nowrap text-locker-ink-muted">no model call</span>;
  }

  // The probability is already oriented to the user's team by the server.
  return (
    <span className="text-[11.5px] whitespace-nowrap text-locker-model tabular-nums">
      model: {teamAbbreviation} {PERCENT(call.yourTeamWinProbability)}
      {call.wasCorrect !== null && (
        <span className="ml-1 text-locker-ink-muted">{call.wasCorrect ? "✓" : "✗"}</span>
      )}
    </span>
  );
}
