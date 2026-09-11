import { useState } from "react";
import { Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TeamBadge } from "@/components/TeamBadge";
import { PICK_RECORD, type ModelChallenge } from "./placeholderData";

interface BeatTheModelCardProps {
  challenge: ModelChallenge;
}

type Side = "home" | "away";

const PERCENT = (value: number) => `${Math.round(value * 100)}%`;

// The page's single focal action, and the reason an account is worth having.
//
// Two things make this impossible to fake client-side, and both are worth
// keeping in mind when this gets wired up:
//
//  1. GamePrediction is `gameId @unique` and is UPSERTED by
//     predict_games.py, so the model's numbers as they stood at pick time
//     are destroyed on the next run. GamePick has to copy them (the
//     *AtPick columns) or "what did the model say when I called it?"
//     becomes permanently unanswerable.
//  2. The final score is withheld server-side by
//     GET /v1/me/challenge/next and only returned once POST /v1/me/picks
//     has written the row. Signed out there is nobody to hide it from you
//     and nobody to grade you.
//
// Until then the answer lives in placeholderData and this grades locally.
export function BeatTheModelCard({ challenge }: BeatTheModelCardProps) {
  const [call, setCall] = useState<Side | null>(null);

  const homeWon = challenge.finalHomeScore > challenge.finalAwayScore;
  const truth: Side = homeWon ? "home" : "away";
  const modelPick: Side = challenge.homeWinProbability >= 0.5 ? "home" : "away";

  const calledCity = call === "home" ? challenge.homeCity : challenge.awayCity;
  const wasRight = call === truth;
  const modelWasRight = modelPick === truth;
  const favoured = modelPick === "home" ? challenge.homeTeam : challenge.awayTeam;
  const favouredProbability =
    modelPick === "home" ? challenge.homeWinProbability : 1 - challenge.homeWinProbability;

  // Order the Elo pair to match the sentence in front of it ("the model likes
  // OKC 64% · Elo 1612 vs 1548"), otherwise a home favourite reads
  // underdog-first and the numbers look transposed.
  const favouredElo = modelPick === "home" ? challenge.homeTeamEloPre : challenge.awayTeamEloPre;
  const underdogElo = modelPick === "home" ? challenge.awayTeamEloPre : challenge.homeTeamEloPre;

  // The margin is Four Factors, the probability is Elo — two different models
  // that can disagree on who wins. Derive the margin's own side from its sign
  // rather than attributing it to whoever Elo favoured, which would otherwise
  // print a margin for a team the margin does not actually favour.
  const marginTeam = challenge.predictedMarginHome >= 0 ? challenge.homeTeam : challenge.awayTeam;

  return (
    <Card className="rounded-none border-landing-light bg-locker-surface p-6 shadow-[0_10px_26px_rgba(0,0,0,0.16)]">
      <div className="mb-2 flex items-center gap-3">
        <p className="font-mono text-[10px] tracking-[0.2em] text-locker-ink-muted uppercase">
          Beat the model · call {challenge.callNumber} of your run
        </p>
        <span className="ml-auto border border-landing-light px-2.5 py-0.5 font-mono text-[9.5px] tracking-[0.14em] whitespace-nowrap text-locker-ink-muted uppercase">
          {call ? "Graded" : "Result hidden"}
        </span>
      </div>

      {call === null ? (
        <>
          {/* Say plainly what this is. These are finished games with the score
              withheld — a blind test, not a forecast — and the answer is one
              authed GET /v1/games away in another tab. Claiming otherwise
              would be a worse look than admitting it. */}
          <p className="mb-4 max-w-[62ch] text-[12.5px] text-locker-ink-muted">
            A completed {challenge.season} game with the final score withheld on the server. Call it, and we
            grade you against the result — and against what the Elo model said at the moment you called.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-5 pt-0.5 pb-3">
            <span className="flex items-center gap-2.5">
              <TeamBadge team={challenge.awayTeam} />
              <span className="font-display text-xl tracking-[0.01em] text-landing-ink uppercase">
                {challenge.awayCity}
              </span>
            </span>
            <span className="text-sm text-locker-ink-muted">@</span>
            <span className="flex items-center gap-2.5">
              <span className="font-display text-xl tracking-[0.01em] text-landing-ink uppercase">
                {challenge.homeCity}
              </span>
              <TeamBadge team={challenge.homeTeam} />
            </span>
          </div>
          <p className="mb-4 text-center text-[11.5px] text-locker-ink-muted">
            {challenge.playedOn} · {challenge.venue}
          </p>

          <div className="mb-4 border border-landing-light bg-landing-hero px-3.5 py-3">
            <p className="flex flex-wrap items-baseline gap-2 text-[13px] text-locker-ink-muted">
              <span>The model likes</span>
              <b className="font-semibold text-locker-model tabular-nums">
                {favoured.abbreviation} {PERCENT(favouredProbability)}
              </b>
              <span>
                · Elo {Math.round(favouredElo)} vs {Math.round(underdogElo)} · predicted margin{" "}
                {marginTeam.abbreviation} by {Math.abs(challenge.predictedMarginHome).toFixed(1)}
              </span>
              {/* The margin falls back to fixed literature weights when there
                  isn't enough game history to fit the regression. Say which,
                  rather than presenting both with equal confidence. */}
              {challenge.marginMethod === "heuristic" && (
                <span className="border border-landing-light px-1.5 py-px font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                  heuristic
                </span>
              )}
            </p>
            <div
              role="img"
              aria-label={`Model win probability: ${challenge.homeTeam.abbreviation} ${PERCENT(challenge.homeWinProbability)}, ${challenge.awayTeam.abbreviation} ${PERCENT(1 - challenge.homeWinProbability)}`}
              className="mt-2.5 flex h-1.5 bg-[#c3bfb9]"
            >
              <span
                className="block h-full bg-locker-model"
                style={{ width: `${(1 - challenge.homeWinProbability) * 100}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[9.5px] tracking-[0.12em] text-locker-ink-muted uppercase">
              <span>
                {challenge.awayTeam.abbreviation} {PERCENT(1 - challenge.homeWinProbability)}
              </span>
              <span>
                {challenge.homeTeam.abbreviation} {PERCENT(challenge.homeWinProbability)}
              </span>
            </div>
          </div>

          {/* The only leather-textured fills on the page — a callback to the
              landing CTA, spent once, on the one place you are meant to act. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setCall("away")}
              className="leather-texture h-12 font-display text-base tracking-[0.07em] text-white uppercase shadow-[0_6px_16px_rgba(0,0,0,0.2)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-landing-ink"
            >
              {challenge.awayCity}
            </button>
            <button
              type="button"
              onClick={() => setCall("home")}
              className="leather-texture h-12 font-display text-base tracking-[0.07em] text-white uppercase shadow-[0_6px_16px_rgba(0,0,0,0.2)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-landing-ink"
            >
              {challenge.homeCity}
            </button>
          </div>
        </>
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-3.5">
            <span className="font-display text-2xl text-landing-ink tabular-nums">
              {challenge.homeTeam.abbreviation} {challenge.finalHomeScore} &mdash; {challenge.finalAwayScore}{" "}
              {challenge.awayTeam.abbreviation}
            </span>
            {/* Glyph AND word, never colour alone — a red/green pair is the
                one CVD case re-stepping the hues cannot fix. */}
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
            You called {calledCity}.{" "}
            {modelWasRight
              ? `The model had it too — ${favoured.abbreviation} at ${PERCENT(favouredProbability)}.`
              : `The model missed this one — it had ${favoured.abbreviation} at ${PERCENT(favouredProbability)}.`}
          </p>
          <p className="mt-1 text-[13px] text-locker-ink-muted">
            You&rsquo;re {PICK_RECORD.wins}&ndash;{PICK_RECORD.losses} against the Elo model&rsquo;s{" "}
            {PICK_RECORD.modelWins}&ndash;{PICK_RECORD.modelLosses} on the same games.
          </p>

          <p className="mt-4">
            <button
              type="button"
              onClick={() => setCall(null)}
              className="text-[12.5px] text-locker-leather underline underline-offset-[3px] hover:text-landing-ink"
            >
              Next call &rarr;
            </button>
          </p>
        </div>
      )}
    </Card>
  );
}
