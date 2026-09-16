import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { ApiError } from "@/lib/apiClient";
import { fetchNextChallenge, fetchPickRecord, submitPick } from "@/lib/nbaApi";
import { signInWithGoogle } from "@/lib/authClient";
import { Card } from "@/components/ui/card";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { TeamBadge } from "@/components/TeamBadge";
import type { ChallengeGame, GradedPick } from "@/types/nba";

// HTTP statuses this card treats as states rather than failures: a signed-out
// visitor and a user who has run out of games are both normal, and neither
// should render as an error.
const UNAUTHENTICATED_STATUS = 401;
const NOTHING_LEFT_STATUS = 404;

// The server's answer when this user has already called the game on screen,
// e.g. from another tab. The card moves on to a new game rather than stopping
// on an error the user can do nothing about.
const ALREADY_CALLED_STATUS = 409;

const CHALLENGE_QUERY_KEY = ["challenge", "next"];

const PERCENT = (value: number) => `${Math.round(value * 100)}%`;

function Shell({ kicker, badge, children }: { kicker: string; badge?: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-none border-landing-light bg-locker-surface p-4 sm:p-6 shadow-[0_10px_26px_rgba(0,0,0,0.16)]">
      <div className="mb-2 flex items-center gap-3">
        <p className="font-mono text-[10px] tracking-[0.2em] text-locker-ink-muted uppercase">{kicker}</p>
        {badge && (
          <span className="ml-auto border border-landing-light px-2.5 py-0.5 font-mono text-[9.5px] tracking-[0.14em] whitespace-nowrap text-locker-ink-muted uppercase">
            {badge}
          </span>
        )}
      </div>
      {children}
    </Card>
  );
}

/**
 * The page's one focal action: call a completed game whose score the server is
 * withholding, and get graded against both the result and the Elo model.
 *
 * Every game comes from GET /v1/me/challenge/next: a real, completed,
 * model-predicted game from the database that this user has not called,
 * newest first. There is no local fixture.
 *
 * The one rule the state handling below exists to keep: a game the user has
 * already called is never shown as a question again. The moment a call lands,
 * the cached challenge is reset, so the next game starts loading while the
 * graded result is on screen, and no stale copy of the called game is left in
 * the cache for "Next call" or a later visit to show.
 *
 * The server's filter is the real guarantee, but the card no longer trusts a
 * single response for it: every game graded here is remembered, and one that
 * comes back anyway is treated as "nothing new" rather than re-asked. When
 * there is nothing left, the card waits for new games and can check again.
 */
export function BeatTheModelCard() {
  const queryClient = useQueryClient();

  // Every game this card has graded, whether called here or (a 409) already
  // called elsewhere. Held for the life of the card.
  const [calledGameIds, setCalledGameIds] = useState<ReadonlySet<string>>(() => new Set());

  function rememberCalled(gameId: string) {
    setCalledGameIds((previous) => new Set(previous).add(gameId));
  }

  const challengeQuery = useQuery({
    queryKey: CHALLENGE_QUERY_KEY,
    queryFn: fetchNextChallenge,
    // Which game is next changes with every call, so this query opts out of
    // the app-wide staleTime and always checks with the server on mount.
    staleTime: 0,
    refetchOnMount: "always",
    // Overrides the app-wide off switch: a user waiting for new games who
    // comes back to the tab should see them without reloading.
    refetchOnWindowFocus: true,
    // A 401 and a 404 are both terminal answers, not transient faults —
    // retrying either just delays the state the user should already be seeing.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && [UNAUTHENTICATED_STATUS, NOTHING_LEFT_STATUS].includes(error.status)) &&
      failureCount < 2,
  });

  // Drops the cached challenge and fetches the next uncalled game. Resetting
  // rather than invalidating clears the old data outright, so nothing can
  // render the called game while the new one is in flight.
  function loadNextChallenge() {
    void queryClient.resetQueries({ queryKey: CHALLENGE_QUERY_KEY });
  }

  const pickMutation = useMutation({
    // The game travels with the call, so the graded result renders from this
    // snapshot rather than from the challenge query, which is already moving
    // on to the next game.
    mutationFn: ({ game, teamId }: { game: ChallengeGame; teamId: string }) => submitPick(game.gameId, teamId),
    onSuccess: (_graded, { game }) => {
      rememberCalled(game.gameId);
      loadNextChallenge();
      // The record feeds the leaderboard and the user's own head-to-head, so
      // both are stale the moment a call lands.
      queryClient.invalidateQueries({ queryKey: ["pickRecord"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (error, { game }) => {
      if (error instanceof ApiError && error.status === ALREADY_CALLED_STATUS) {
        rememberCalled(game.gameId);
        pickMutation.reset();
        loadNextChallenge();
      }
    },
  });

  const recordQuery = useQuery({
    queryKey: ["pickRecord"],
    queryFn: fetchPickRecord,
    retry: false,
  });

  /**
   * Clears the graded result to reveal the next game.
   *
   * The next game has been loading since the call landed (see onSuccess), so
   * this usually swaps it in instantly. If it is still in flight the card
   * shows its loading state, never the game just called.
   *
   * It also asks the server again, joining that load rather than restarting
   * it if it hasn't finished. Before, this only reset local state, so the one
   * post-call response was final: if it handed back the game just called,
   * every press of "Next call" showed that game again with no request sent.
   */
  function advanceToNextCall() {
    pickMutation.reset();
    void queryClient.refetchQueries({ queryKey: CHALLENGE_QUERY_KEY }, { cancelRefetch: false });
  }

  // Checked before the challenge query's own states: the graded result is
  // drawn from the call's snapshot, so it stays on screen while that query
  // resets and loads the next game underneath it.
  const graded = pickMutation.data;
  const gradedGame = pickMutation.variables?.game;
  if (graded && gradedGame) {
    return (
      <Shell kicker="Beat the model" badge="Graded">
        <GradedResult game={gradedGame} graded={graded} />
        <p className="mt-4">
          <button
            type="button"
            onClick={advanceToNextCall}
            className="text-[12.5px] text-locker-leather underline underline-offset-[3px] hover:text-landing-ink"
          >
            Next call &rarr;
          </button>
        </p>
        {recordQuery.data && <RecordLine record={recordQuery.data} />}
      </Shell>
    );
  }

  if (challengeQuery.isPending) {
    return (
      <Shell kicker="Beat the model">
        <div className="flex min-h-48 items-center justify-center">
          <BasketballSpinner label="Finding a game to call" />
        </div>
      </Shell>
    );
  }

  const error = challengeQuery.error;

  if (error instanceof ApiError && error.status === UNAUTHENTICATED_STATUS) {
    return (
      <Shell kicker="Beat the model" badge="Sign in">
        <p className="mb-4 max-w-[62ch] text-[12.5px] text-locker-ink-muted">
          We hold a completed game with the final score withheld. Call it and we grade you against the result —
          and against what the Elo model said. Your record is kept to your account, which is the only way the
          server can hide the answer from you and still score you on it.
        </p>
        <button
          type="button"
          onClick={() => signInWithGoogle(window.location.href)}
          className="leather-texture h-12 px-6 font-display text-base tracking-[0.07em] text-white uppercase shadow-[0_6px_16px_rgba(0,0,0,0.2)] transition-opacity hover:opacity-90"
        >
          Sign in to play
        </button>
      </Shell>
    );
  }

  // A game already graded here is never a question again. If a response
  // hands one back, it means nothing new is available yet: show the spinner
  // while the card is still asking, and the waiting state once it has asked.
  const servedCalledGame = challengeQuery.data !== undefined && calledGameIds.has(challengeQuery.data.gameId);
  if (servedCalledGame && challengeQuery.isFetching) {
    return (
      <Shell kicker="Beat the model">
        <div className="flex min-h-48 items-center justify-center">
          <BasketballSpinner label="Finding a game to call" />
        </div>
      </Shell>
    );
  }

  if ((error instanceof ApiError && error.status === NOTHING_LEFT_STATUS) || servedCalledGame) {
    return (
      <Shell kicker="Beat the model" badge="Waiting">
        <p className="font-display text-xl text-landing-ink uppercase">Waiting For New Games</p>
        <button
          type="button"
          onClick={() => challengeQuery.refetch()}
          disabled={challengeQuery.isFetching}
          className="mt-3 text-[12.5px] text-locker-leather underline underline-offset-[3px] disabled:opacity-60"
        >
          {challengeQuery.isFetching ? "Checking…" : "Check again"}
        </button>
        {recordQuery.data && <RecordLine record={recordQuery.data} />}
      </Shell>
    );
  }

  if (challengeQuery.isError || !challengeQuery.data) {
    return (
      <Shell kicker="Beat the model">
        <p className="text-[12.5px] text-locker-bad">Could not load a game to call.</p>
        <button
          type="button"
          onClick={() => challengeQuery.refetch()}
          className="mt-3 text-[12.5px] text-locker-leather underline underline-offset-[3px]"
        >
          Try again
        </button>
      </Shell>
    );
  }

  const challengeGame = challengeQuery.data;
  return (
    <Shell kicker="Beat the model" badge="Result hidden">
      <ChallengeQuestion
        game={challengeGame}
        isSubmitting={pickMutation.isPending}
        errorMessage={pickMutation.error instanceof Error ? pickMutation.error.message : null}
        onCall={(teamId) => pickMutation.mutate({ game: challengeGame, teamId })}
      />
      {recordQuery.data && <RecordLine record={recordQuery.data} />}
    </Shell>
  );
}

function RecordLine({ record }: { record: { wins: number; losses: number; modelWins: number; modelLosses: number; total: number } }) {
  if (record.total === 0) return null;
  return (
    <p className="mt-3 border-t border-landing-light pt-3 text-[11.5px] text-locker-ink-muted">
      Your record <b className="font-semibold text-locker-you">{record.wins}&ndash;{record.losses}</b> · the model
      on the same games <b className="font-semibold text-locker-model">{record.modelWins}&ndash;{record.modelLosses}</b>
    </p>
  );
}

function ChallengeQuestion({
  game,
  isSubmitting,
  errorMessage,
  onCall,
}: {
  game: ChallengeGame;
  isSubmitting: boolean;
  errorMessage: string | null;
  onCall: (teamId: string) => void;
}) {
  const modelLikesHome = game.prediction.homeWinProbability >= 0.5;
  const favourite = modelLikesHome ? game.homeTeam : game.awayTeam;
  const favouriteProbability = modelLikesHome
    ? game.prediction.homeWinProbability
    : 1 - game.prediction.homeWinProbability;
  const margin = game.prediction.predictedMarginHome;
  const marginTeam = margin === null ? null : margin >= 0 ? game.homeTeam : game.awayTeam;

  return (
    <>
      <p className="mb-4 max-w-[62ch] text-[12.5px] text-locker-ink-muted">
        A completed {game.season} game with the final score withheld on the server. Call it, and we grade you
        against the result — and against what the Elo model said.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-5 pb-3">
        <span className="flex items-center gap-2.5">
          <TeamBadge team={{ abbreviation: game.awayTeam.abbreviation }} />
          <span className="font-display text-xl text-landing-ink uppercase">{game.awayTeam.city}</span>
        </span>
        <span className="text-sm text-locker-ink-muted">@</span>
        <span className="flex items-center gap-2.5">
          <span className="font-display text-xl text-landing-ink uppercase">{game.homeTeam.city}</span>
          <TeamBadge team={{ abbreviation: game.homeTeam.abbreviation }} />
        </span>
      </div>
      <p className="mb-4 text-center text-[11.5px] text-locker-ink-muted">
        {new Date(game.gameDate).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
      </p>

      <div className="mb-4 border border-landing-light bg-landing-hero px-3.5 py-3">
        <p className="flex flex-wrap items-baseline gap-2 text-[13px] text-locker-ink-muted">
          <span>The model likes</span>
          <b className="font-semibold text-locker-model tabular-nums">
            {favourite.abbreviation} {PERCENT(favouriteProbability)}
          </b>
          <span>
            · Elo {Math.round(modelLikesHome ? game.prediction.homeTeamEloPre : game.prediction.awayTeamEloPre)} vs{" "}
            {Math.round(modelLikesHome ? game.prediction.awayTeamEloPre : game.prediction.homeTeamEloPre)}
            {marginTeam && margin !== null && ` · predicted margin ${marginTeam.abbreviation} by ${Math.abs(margin).toFixed(1)}`}
          </span>
          {game.prediction.marginMethod === "heuristic" && (
            <span className="border border-landing-light px-1.5 py-px font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
              heuristic
            </span>
          )}
        </p>
        <div
          role="img"
          aria-label={`Model win probability: ${game.homeTeam.abbreviation} ${PERCENT(game.prediction.homeWinProbability)}, ${game.awayTeam.abbreviation} ${PERCENT(1 - game.prediction.homeWinProbability)}`}
          className="mt-2.5 flex h-1.5 bg-[#c3bfb9]"
        >
          <span className="block h-full bg-locker-model" style={{ width: `${(1 - game.prediction.homeWinProbability) * 100}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[9.5px] tracking-[0.12em] text-locker-ink-muted uppercase">
          <span>{game.awayTeam.abbreviation} {PERCENT(1 - game.prediction.homeWinProbability)}</span>
          <span>{game.homeTeam.abbreviation} {PERCENT(game.prediction.homeWinProbability)}</span>
        </div>
      </div>

      {errorMessage && (
        <p role="alert" className="mb-3 text-[12px] text-locker-bad">
          {errorMessage}
        </p>
      )}

      {/* The only leather-textured fills on the page — a callback to the
          landing CTA, spent once, on the one place you are meant to act. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[game.awayTeam, game.homeTeam].map((team) => (
          <button
            key={team.id}
            type="button"
            disabled={isSubmitting}
            onClick={() => onCall(team.id)}
            className="leather-texture h-12 font-display text-base tracking-[0.07em] text-white uppercase shadow-[0_6px_16px_rgba(0,0,0,0.2)] transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-landing-ink"
          >
            {team.city}
          </button>
        ))}
      </div>
    </>
  );
}

function GradedResult({ game, graded }: { game: ChallengeGame; graded: GradedPick }) {
  const wasRight = graded.outcome === "CORRECT";
  const calledTeam = graded.pickedTeamId === game.homeTeam.id ? game.homeTeam : game.awayTeam;
  const modelTeam = graded.model.favoriteTeamId === game.homeTeam.id ? game.homeTeam : game.awayTeam;

  return (
    <div aria-live="polite">
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="font-display text-2xl text-landing-ink tabular-nums">
          {game.homeTeam.abbreviation} {graded.finalScore.homeScore} &mdash; {graded.finalScore.awayScore}{" "}
          {game.awayTeam.abbreviation}
        </span>
        {/* Glyph AND word, never colour alone. */}
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 font-mono text-[10px] tracking-[0.12em] text-white uppercase ${
            wasRight ? "bg-locker-good" : "bg-locker-bad"
          }`}
        >
          {wasRight ? <Check aria-hidden className="size-3.5" /> : <X aria-hidden className="size-3.5" />}
          {wasRight ? "Correct" : "Missed"}
        </span>
      </div>
      <p className="mt-3 text-[13px] text-locker-ink-muted">
        You called {calledTeam.city}.{" "}
        {graded.model.outcome === "CORRECT"
          ? `The model had it too — ${modelTeam.abbreviation} at ${PERCENT(Math.max(graded.model.homeWinProbability, 1 - graded.model.homeWinProbability))}.`
          : `The model missed this one — it had ${modelTeam.abbreviation} at ${PERCENT(Math.max(graded.model.homeWinProbability, 1 - graded.model.homeWinProbability))}.`}
      </p>
    </div>
  );
}
