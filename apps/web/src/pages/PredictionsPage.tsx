import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Flame, Search, Swords, Trophy, X } from "lucide-react";
import { fetchEloRatings, fetchGames, fetchSeasons } from "@/lib/nbaApi";
import { ErrorState } from "@/components/ErrorState";
import { TeamBadge } from "@/components/TeamBadge";
import { HitMissPill } from "@/components/HitMissPill";
import { PlayerCardsDisplay, useUpcomingPlayerReliability } from "@/components/PlayerCards";
import { SeasonSegmentControl } from "@/components/SeasonSegmentControl";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { PERCENT, formatMargin, isCompleted, wasModelHit } from "@/lib/predictions";
import {
  ALL_SEGMENTS,
  SEASON_TYPES_IN_ORDER,
  formatSeasonType,
  parseUrlSegmentSelection,
  toSeasonTypeParam,
  toUrlSegmentSelection,
} from "@/lib/seasonType";
import type { SeasonSegmentSelection } from "@/lib/seasonType";
import type { Game, GamePrediction, TeamEloRating } from "@/types/nba";

// The games list is the one view that can show a whole season at once — see
// ALL_SEGMENTS. Ordered so "All" reads first, then the season in sequence.
const GAME_SEGMENT_OPTIONS: SeasonSegmentSelection[] = [ALL_SEGMENTS, ...SEASON_TYPES_IN_ORDER];

// A single larger fetch, then searched entirely client-side (see
// matchesSearch below) — GET /v1/games has no server-side team-name search
// today, and the game volumes this app actually has don't need one yet.
// season/status, unlike search, ARE real server params (see gamesQuery
// below) — a single season alone can run well over a thousand games, too
// many to reliably cover with a client-side slice the way search doesn't
// need to worry about.
const GAMES_TO_FETCH = 60;

// The track-record sections (Recent results, Model track record) need
// actual completed games regardless of whatever season/status the main
// card grid below is currently filtered to — they answer "how has the
// model been doing," which should stay stable while someone browses a
// specific season's or upcoming games' cards. Fetched separately with
// status=completed rather than derived from gamesQuery's own (possibly
// upcoming-only, possibly season-scoped) result set.
const RECENT_GAMES_TO_FETCH = 60;

// Nine cards reads as a clean 3x3 on the grid's own xl:grid-cols-3 before
// "View more" — showing all 60 fetched games at once buried the sections
// below the grid (Tailored for you, How it works) under scrolling.
const CARDS_PAGE_SIZE = 9;

// How many soonest-upcoming games to scan for "most anticipated" / "most
// confident" — enough to have a real spread of confidence levels to pick a
// genuine extreme from, small enough to stay a cheap single fetch.
const UPCOMING_GAMES_FOR_HIGHLIGHTS = 20;

function confidence(game: Game): number | null {
  if (!game.prediction) return null;
  return Math.max(game.prediction.homeWinProbability, 1 - game.prediction.homeWinProbability);
}

// The closest predicted matchup among upcoming games (win probability
// nearest a coin flip) — a real, honestly-computed "this one's a toss-up"
// signal, not an editorial pick.
function findMostAnticipated(games: Game[]): Game | null {
  const withPredictions = games.filter((game) => game.prediction !== undefined && game.prediction !== null);
  if (withPredictions.length === 0) return null;
  return withPredictions.slice().sort((a, b) => confidence(a)! - confidence(b)!)[0];
}

// The most lopsided predicted matchup among upcoming games (win probability
// furthest from a coin flip) — the model's single most confident live call
// right now.
function findMostConfident(games: Game[]): Game | null {
  const withPredictions = games.filter((game) => game.prediction !== undefined && game.prediction !== null);
  if (withPredictions.length === 0) return null;
  return withPredictions.slice().sort((a, b) => confidence(b)! - confidence(a)!)[0];
}

interface ModelHighlightCardProps {
  icon: typeof Trophy;
  label: string;
  children: React.ReactNode;
}

function ModelHighlightCard({ icon: Icon, label, children }: ModelHighlightCardProps) {
  return (
    <div className="border border-landing-light bg-locker-surface p-4">
      <div className="mb-3 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.14em] text-locker-ink-muted uppercase">
        <Icon aria-hidden className="size-3.5 text-locker-leather" />
        {label}
      </div>
      {children}
    </div>
  );
}

function GameHighlightBody({ game }: { game: Game }) {
  const prediction = game.prediction!;
  const favored = prediction.homeWinProbability >= 0.5 ? game.homeTeam : game.awayTeam;
  const favoredProbability = Math.max(prediction.homeWinProbability, 1 - prediction.homeWinProbability);

  return (
    <Link to={`/games/${game.id}`} className="block hover:opacity-80">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <TeamBadge team={game.awayTeam} size="sm" />
          <span className="font-display text-[13px] text-landing-ink uppercase">{game.awayTeam.abbreviation}</span>
        </span>
        <span className="font-mono text-[10px] text-locker-ink-muted">@</span>
        <span className="flex items-center gap-1.5">
          <span className="font-display text-[13px] text-landing-ink uppercase">{game.homeTeam.abbreviation}</span>
          <TeamBadge team={game.homeTeam} size="sm" />
        </span>
      </div>
      <p className="mt-2 text-[11.5px] text-locker-ink-muted">
        {new Date(game.gameDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · model likes{" "}
        <span className="font-semibold text-landing-ink">
          {favored.abbreviation} {PERCENT(favoredProbability)}
        </span>
      </p>
    </Link>
  );
}

// "Best-rated team right now," not "championship pick" — this app has no
// playoff bracket or season simulation, only single-game Elo/Four Factors
// predictions, so a specific title claim would be a fabricated number. The
// highest current Elo rating (see TeamsService.getEloRatings) is the
// honest proxy: a real, computed "the model rates this team best" fact,
// framed as exactly that rather than dressed up as a title prediction.
function BestRatedTeamBody({ rating }: { rating: TeamEloRating }) {
  return (
    <Link to={`/teams/${rating.team.id}`} className="flex items-center gap-2.5 hover:opacity-80">
      <TeamBadge team={rating.team} size="md" />
      <div>
        <p className="font-display text-[13px] text-landing-ink uppercase">
          {rating.team.city} {rating.team.name}
        </p>
        <p className="text-[11.5px] text-locker-ink-muted">
          Elo <span className="font-semibold text-landing-ink tabular-nums">{Math.round(rating.elo)}</span> — best
          in the league right now
        </p>
      </div>
    </Link>
  );
}

function EmptyHighlight({ message }: { message: string }) {
  return <p className="text-[11.5px] text-locker-ink-muted">{message}</p>;
}

// Three real, computed angles on what the model is saying right now, led
// with at the top of the page (before anyone scrolls to the card grid) —
// not a fabricated bracket/title pick (see BestRatedTeamBody's doc
// comment). Each card sources from data this app already predicts:
//   - Most anticipated: closest upcoming win probability to a coin flip.
//   - Most confident: most lopsided upcoming win probability.
//   - Best-rated team: highest current Elo (GET /v1/teams/elo-ratings).
function ModelHighlightsSection() {
  const upcomingGamesQuery = useQuery({
    queryKey: ["games", { pageSize: UPCOMING_GAMES_FOR_HIGHLIGHTS, status: "upcoming" as const }],
    queryFn: () => fetchGames({ pageSize: UPCOMING_GAMES_FOR_HIGHLIGHTS, status: "upcoming" }),
  });
  const eloRatingsQuery = useQuery({ queryKey: ["eloRatings"], queryFn: fetchEloRatings });

  const isPending = upcomingGamesQuery.isPending || eloRatingsQuery.isPending;
  const upcomingGames = upcomingGamesQuery.data?.data ?? [];
  const mostAnticipated = findMostAnticipated(upcomingGames);
  const mostConfident = findMostConfident(upcomingGames);
  const bestRated = eloRatingsQuery.data?.[0] ?? null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          Model highlights
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
      </div>

      {isPending ? (
        <div className="flex justify-center border border-landing-light bg-locker-surface py-8">
          <BasketballSpinner size="sm" label="Loading model highlights" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <ModelHighlightCard icon={Swords} label="Most anticipated">
            {mostAnticipated ? (
              <GameHighlightBody game={mostAnticipated} />
            ) : (
              <EmptyHighlight message="No upcoming games with a prediction yet." />
            )}
          </ModelHighlightCard>
          <ModelHighlightCard icon={Flame} label="Most confident pick">
            {mostConfident ? (
              <GameHighlightBody game={mostConfident} />
            ) : (
              <EmptyHighlight message="No upcoming games with a prediction yet." />
            )}
          </ModelHighlightCard>
          <ModelHighlightCard icon={Trophy} label="Best-rated team">
            {bestRated ? (
              <BestRatedTeamBody rating={bestRated} />
            ) : (
              <EmptyHighlight message="No Elo ratings available yet." />
            )}
          </ModelHighlightCard>
        </div>
      )}
    </section>
  );
}

interface GamePredictionCardProps {
  game: Game;
  prediction: GamePrediction | null | undefined;
}

// Same visual family as the homepage's "Beat the model" card — a locker-
// surface tile with a leather-team border, team badges either side of the
// model's own win-probability bar (locker-model blue, the same color that
// carries "this is the machine's opinion" everywhere else on the app), so
// the two places a user sees the Elo model's output read as one product
// instead of two differently-designed screens.
function GamePredictionCard({ game, prediction }: GamePredictionCardProps) {
  const homeFavored = prediction ? prediction.homeWinProbability >= 0.5 : null;
  const hit = prediction ? wasModelHit(game, prediction) : null;

  return (
    <Link to={`/games/${game.id}`} className="block">
      <div className="group h-full border border-landing-light bg-locker-surface p-4 transition-colors hover:border-locker-leather">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <TeamBadge team={game.awayTeam} size="sm" />
            <span className="font-display text-sm tracking-[0.01em] text-landing-ink uppercase">
              {game.awayTeam.abbreviation}
            </span>
          </span>
          <span className="font-mono text-[10px] tracking-[0.14em] text-locker-ink-muted uppercase">@</span>
          <span className="flex items-center gap-2">
            <span className="font-display text-sm tracking-[0.01em] text-landing-ink uppercase">
              {game.homeTeam.abbreviation}
            </span>
            <TeamBadge team={game.homeTeam} size="sm" />
          </span>
        </div>

        {isCompleted(game) && (
          <p className="mt-2 text-center font-mono text-[10px] tracking-[0.1em] text-locker-ink-muted uppercase">
            Final: {game.awayTeam.abbreviation} {game.awayScore} — {game.homeScore} {game.homeTeam.abbreviation}
          </p>
        )}

        {!prediction ? (
          <p className="mt-4 text-center text-[11.5px] text-locker-ink-muted">No prediction yet</p>
        ) : (
          <div className="mt-4">
            <div
              role="img"
              aria-label={`Model win probability: ${game.awayTeam.abbreviation} ${PERCENT(1 - prediction.homeWinProbability)}, ${game.homeTeam.abbreviation} ${PERCENT(prediction.homeWinProbability)}`}
              className="flex h-1.5 bg-[#c3bfb9]"
            >
              <span
                className="block h-full bg-locker-model"
                style={{ width: `${(1 - prediction.homeWinProbability) * 100}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[9.5px] tracking-[0.12em] text-locker-ink-muted uppercase">
              <span>
                {game.awayTeam.abbreviation} {PERCENT(1 - prediction.homeWinProbability)}
              </span>
              <span>
                {game.homeTeam.abbreviation} {PERCENT(prediction.homeWinProbability)}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-landing-light pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg text-landing-ink tabular-nums">
                  {homeFavored ? game.homeTeam.abbreviation : game.awayTeam.abbreviation}
                </span>
                <span
                  className="text-[11.5px] text-locker-ink-muted"
                  title="Predicted margin is backtested at ~12.5 points mean absolute error — only marginally better than guessing the leaguewide average margin. Treat as a rough secondary signal, not a precise forecast."
                >
                  favored · {formatMargin(prediction.predictedMarginHome, game.homeTeam, game.awayTeam)}
                </span>
                {prediction.marginMethod === "heuristic" && (
                  <span className="border border-landing-light px-1.5 py-px font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                    heuristic
                  </span>
                )}
              </div>
              {hit !== null && <HitMissPill hit={hit} />}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

const RECENT_FORM_WINDOW = 20;

interface RecentFormGame {
  game: Game;
  hit: boolean;
}

function computeRecentForm(games: Game[]): RecentFormGame[] {
  return games
    .filter((game): game is Game & { prediction: GamePrediction } => Boolean(game.prediction) && isCompleted(game))
    .slice()
    .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())
    .slice(0, RECENT_FORM_WINDOW)
    .map((game) => ({ game, hit: wasModelHit(game, game.prediction)! }))
    .reverse(); // oldest → newest, left → right, matching how a form guide reads
}

interface TeamRecord {
  team: Game["homeTeam"];
  hits: number;
  total: number;
  hitRate: number;
}

// Minimum sample before a team's record is worth surfacing as an
// "outlier" or "most predictable" — below this, one lucky/unlucky upset
// swings the rate too much to mean anything.
const TEAM_INSIGHT_MIN_GAMES = 3;

function computeTeamRecords(games: Game[]): TeamRecord[] {
  const byTeam = new Map<string, TeamRecord>();
  for (const game of games) {
    if (!game.prediction || !isCompleted(game)) continue;
    const hit = wasModelHit(game, game.prediction);
    if (hit === null) continue;
    for (const team of [game.homeTeam, game.awayTeam]) {
      const existing = byTeam.get(team.id) ?? { team, hits: 0, total: 0, hitRate: 0 };
      existing.total += 1;
      if (hit) existing.hits += 1;
      byTeam.set(team.id, existing);
    }
  }
  return Array.from(byTeam.values())
    .filter((record) => record.total >= TEAM_INSIGHT_MIN_GAMES)
    .map((record) => ({ ...record, hitRate: record.hits / record.total }));
}

interface TeamInsights {
  mostPredictable: TeamRecord | null;
  outlier: TeamRecord | null;
}

// Longest run of consecutive correct calls inside the same recent-form
// window shown above (oldest → newest) — a real, honest number computed
// from the same games, not a separate cherry-picked lookback. Alongside the
// plain N/20 headline, this is the flattering-but-true framing: a model
// that's right 13/20 overall can still have strung together a real run of
// good calls, and that streak is what "hot right now" actually means.
function computeLongestStreak(form: RecentFormGame[]): number {
  let longest = 0;
  let current = 0;
  for (const entry of form) {
    current = entry.hit ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

interface HighConfidenceAccuracy {
  hits: number;
  total: number;
  hitRate: number | null;
}

// Accuracy on only the model's own most-confident picks (>= 70% win
// probability for whichever side it favored) — the honest version of "when
// it says it's sure, how often is it right," computed from the same
// completed games already on the page rather than a separate backtest
// endpoint. A well-built model should be MORE accurate here than its
// overall record, which is exactly why this is worth surfacing next to a
// plain N/20 that doesn't distinguish a confident call from a toss-up.
const HIGH_CONFIDENCE_THRESHOLD = 0.7;

// Below this many high-confidence games, the rate is reported as unknown
// rather than shown — a 0/1 or 1/1 reads as either a damning or a flattering
// number and is neither; it's just noise from too small a sample.
const HIGH_CONFIDENCE_MIN_GAMES = 5;

function computeHighConfidenceAccuracy(games: Game[]): HighConfidenceAccuracy {
  let hits = 0;
  let total = 0;
  for (const game of games) {
    if (!game.prediction || !isCompleted(game)) continue;
    const confidence = Math.max(game.prediction.homeWinProbability, 1 - game.prediction.homeWinProbability);
    if (confidence < HIGH_CONFIDENCE_THRESHOLD) continue;
    total += 1;
    if (wasModelHit(game, game.prediction)) hits += 1;
  }
  return { hits, total, hitRate: total >= HIGH_CONFIDENCE_MIN_GAMES ? hits / total : null };
}

// "Most predictable" = the team the model has read best; "outlier" = the
// team it has struggled with most — both need to be genuinely different
// teams, and both need the minimum sample above, or there's nothing
// meaningful to say yet.
function computeTeamInsights(games: Game[]): TeamInsights {
  const records = computeTeamRecords(games);
  if (records.length === 0) return { mostPredictable: null, outlier: null };

  const sorted = records.slice().sort((a, b) => b.hitRate - a.hitRate);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  return {
    mostPredictable: best,
    outlier: worst.team.id !== best.team.id && worst.hitRate < best.hitRate ? worst : null,
  };
}

interface RecentFormStripProps {
  form: RecentFormGame[];
}

// A concrete, glance-able "how's the model been doing lately" — each game
// is its own hoverable/focusable tile (glyph + color, never color alone,
// same CVD rule as HitMissPill) rather than an abstract bucketed rate.
function RecentFormStrip({ form }: RecentFormStripProps) {
  const hits = form.filter((entry) => entry.hit).length;

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl text-landing-ink tabular-nums">{hits}</span>
        <span className="font-mono text-[11px] tracking-[0.08em] text-locker-ink-muted uppercase">
          of {form.length} correct — last {form.length} completed games
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {form.map(({ game, hit }) => (
          <Link
            key={game.id}
            to={`/games/${game.id}`}
            title={`${game.awayTeam.abbreviation} ${game.awayScore} @ ${game.homeTeam.abbreviation} ${game.homeScore} — model ${hit ? "hit" : "missed"}`}
            aria-label={`${game.awayTeam.abbreviation} at ${game.homeTeam.abbreviation}, final ${game.awayScore} to ${game.homeScore}, model ${hit ? "hit" : "missed"}`}
            className={`group relative flex size-6 items-center justify-center transition-transform hover:z-10 hover:scale-110 ${
              hit ? "bg-locker-good" : "bg-locker-bad"
            }`}
          >
            {hit ? (
              <Check aria-hidden className="size-3.5 text-white" />
            ) : (
              <X aria-hidden className="size-3.5 text-white" />
            )}
          </Link>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
        <span>Oldest</span>
        <span>Most recent</span>
      </div>
    </div>
  );
}

interface TeamInsightCardProps {
  label: string;
  record: TeamRecord | null;
  tone: "good" | "bad";
  emptyReason: string;
  description: (record: TeamRecord) => string;
}

function TeamInsightCard({ label, record, tone, emptyReason, description }: TeamInsightCardProps) {
  return (
    <div className="border border-landing-light bg-landing-hero p-3">
      <p className="font-mono text-[9px] tracking-[0.12em] text-locker-ink-muted uppercase">{label}</p>
      {record ? (
        <>
          <div className="mt-1.5 flex items-center gap-2">
            <TeamBadge team={record.team} size="sm" />
            <span className="font-display text-sm text-landing-ink uppercase">{record.team.name}</span>
            <span
              className={`ml-auto font-mono text-[10.5px] tabular-nums ${tone === "good" ? "text-locker-good" : "text-locker-bad"}`}
            >
              {record.hits}/{record.total}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-locker-ink-muted">{description(record)}</p>
        </>
      ) : (
        <p className="mt-1.5 text-[11px] leading-snug text-locker-ink-muted">{emptyReason}</p>
      )}
    </div>
  );
}

function matchesSearch(game: Game, query: string): boolean {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  return (
    game.homeTeam.name.toLowerCase().includes(needle) ||
    game.homeTeam.city.toLowerCase().includes(needle) ||
    game.homeTeam.abbreviation.toLowerCase().includes(needle) ||
    game.awayTeam.name.toLowerCase().includes(needle) ||
    game.awayTeam.city.toLowerCase().includes(needle) ||
    game.awayTeam.abbreviation.toLowerCase().includes(needle)
  );
}

// A step-by-step "how it works" explainer, deliberately given its own dark
// bg-landing-dark treatment (the same "spend the dark palette once, on
// purpose" band the homepage already uses to break up its own page — see
// LandingPage's alternating bg-landing-dark/bg-landing-light sections) so it
// reads as a distinct, slower-paced "read this" zone rather than another
// locker-surface card in the scroll. See PredictionsPage's own note on why
// this stays illustrative rather than pulling in live backtest numbers: that
// needs a real GET /v1/predictions/accuracy endpoint this pass doesn't add.
// docs/reports has the full, real backtest writeup for anyone who wants the
// actual numbers behind these two models.
function HowItWorksSection() {
  return (
    <section className="relative overflow-hidden bg-landing-dark px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl text-center">
        <span className="font-mono text-[10px] tracking-[0.2em] text-white/60 uppercase">How it works</span>
        <h2 className="mt-2 font-display text-2xl tracking-[0.01em] text-white uppercase">
          Two numbers, plain english
        </h2>
        <p className="mt-3 text-[13px] leading-relaxed text-white/75">
          Every card above shows two predictions: who&apos;s likely to win, and by how much. They come from two
          separate, much simpler ideas than they might look — no black box, just each team&apos;s own history
          turned into a number.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2">
        <div className="border border-white/15 bg-white/4 p-5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-locker-model" aria-hidden />
            <h3 className="font-display text-base tracking-[0.01em] text-white uppercase">
              Win probability — Elo
            </h3>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-white/75">
            Think of it like a credit score for a team, built the same way chess ratings are. Win, and the score
            climbs — more if the win was a surprise, less if it wasn&apos;t. Lose, and it falls the same way. The
            bigger the gap between two teams&apos; scores, the more lopsided the odds.
          </p>
          <svg
            viewBox="0 0 280 110"
            role="img"
            aria-label="Illustrative Elo rating climbing after wins and dipping after losses over a season"
            className="mt-5 h-28 w-full"
          >
            {[0, 27.5, 55, 82.5, 110].map((y) => (
              <line key={y} x1={0} y1={y} x2={280} y2={y} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            ))}
            <polyline
              points="0,80 30,72 60,74 90,50 120,55 150,30 180,36 210,18 240,22 280,8"
              fill="none"
              stroke="var(--color-locker-model)"
              strokeWidth={2.5}
            />
            {[
              { x: 30, y: 72, win: true },
              { x: 90, y: 50, win: true },
              { x: 150, y: 30, win: true },
              { x: 180, y: 36, win: false },
              { x: 280, y: 8, win: true },
            ].map((point) => (
              <circle
                key={`${point.x}-${point.y}`}
                cx={point.x}
                cy={point.y}
                r={4}
                fill={point.win ? "var(--color-locker-good)" : "var(--color-locker-bad)"}
                stroke="var(--color-landing-dark)"
                strokeWidth={1.5}
              />
            ))}
          </svg>
          <div className="mt-2 flex items-center justify-center gap-4 font-mono text-[9px] tracking-[0.1em] text-white/60 uppercase">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-locker-good" aria-hidden /> Win — rating rises
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-locker-bad" aria-hidden /> Loss — rating falls
            </span>
          </div>
        </div>

        <div className="border border-white/15 bg-white/4 p-5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-locker-leather" aria-hidden />
            <h3 className="font-display text-base tracking-[0.01em] text-white uppercase">
              Predicted margin — Four Factors
            </h3>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-white/75">
            Basketball analyst Dean Oliver found that most of what separates winning and losing teams comes down
            to three habits: shooting efficiently, not turning the ball over, and getting to the free-throw line.
            Compare two teams&apos; own running averages on those three, and you get a rough sense of who should
            win by more. Rows still using textbook weights instead of ones fitted to this season&apos;s data are
            marked{" "}
            <span className="border border-white/25 px-1 py-px font-mono text-[9px] tracking-[0.1em] text-white/75 uppercase">
              heuristic
            </span>
            .
          </p>
          <div className="mt-5 space-y-3">
            {[
              { label: "Effective shooting", sub: "Shots made, weighted for 3s", home: 78, away: 61 },
              { label: "Turnover rate", sub: "Lower is better — fewer giveaways", home: 45, away: 58 },
              { label: "Free-throw rate", sub: "How often they get to the line", home: 32, away: 40 },
            ].map((factor) => (
              <div key={factor.label}>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[9px] tracking-[0.1em] text-white/60 uppercase">
                    {factor.label}
                  </span>
                  <span className="text-[10px] text-white/45">{factor.sub}</span>
                </div>
                <div className="mt-1 flex h-1.5 gap-0.5">
                  <span className="block h-full bg-locker-leather" style={{ width: `${factor.home}%` }} />
                  <span className="block h-full bg-white/20" style={{ width: `${factor.away}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 font-mono text-[9px] tracking-[0.1em] text-white/60 uppercase">
            <span className="flex items-center gap-1.5">
              <span className="size-2 bg-locker-leather" aria-hidden /> This team
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 bg-white/20" aria-hidden /> Opponent
            </span>
          </div>
        </div>
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-[11px] leading-relaxed text-white/60">
        Neither model watches injuries, trades, or who&apos;s resting tonight — they only know what already
        happened on the court. Treat every prediction as a well-informed starting point, not a guarantee, and lean
        harder on it when the model has been reliable for that team or player lately (see the track record above).
      </p>
    </section>
  );
}

// Placeholder — this app has no followed-team/watchlist data source wired
// to Predictions yet (same honest gap HomePage's WatchlistBoard already
// documents for its own placeholder data). Kept visually present rather
// than omitted so the shape of the feature is real once there's a
// GET /v1/me/... endpoint to back it — swap PLACEHOLDER_TAILORED_GAMES for
// that response and this section needs no other change.
const PLACEHOLDER_TAILORED_GAMES = [
  { matchup: "LAL vs BOS", reason: "You're watching Anthony Davis" },
  { matchup: "DEN vs MIL", reason: "Nuggets are one of your followed teams" },
  { matchup: "GSW vs PHX", reason: "Close matchup — model favors GSW by only 4%" },
];

function TailoredForYouSection() {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          Tailored for you
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
        <span className="font-mono text-[9px] tracking-[0.14em] text-locker-ink-muted uppercase">Preview</span>
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {PLACEHOLDER_TAILORED_GAMES.map((entry) => (
          <div
            key={entry.matchup}
            className="border border-dashed border-landing-light bg-locker-surface p-4 opacity-70"
          >
            <p className="font-display text-sm tracking-[0.01em] text-landing-ink uppercase">{entry.matchup}</p>
            <p className="mt-1 text-[11.5px] text-locker-ink-muted">{entry.reason}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10.5px] text-locker-ink-muted">
        Illustrative — personalizes once followed teams and watchlists are wired up.
      </p>
    </section>
  );
}

export function PredictionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [seasonFilter, setSeasonFilter] = useState<string | "all">("all");
  const [showAllCards, setShowAllCards] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const segment = parseUrlSegmentSelection(searchParams.get("segment"));
  const isPostseasonSegment = segment !== ALL_SEGMENTS && segment !== "REGULAR";

  function selectSegment(nextSegment: SeasonSegmentSelection) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("segment", toUrlSegmentSelection(nextSegment));
    setSearchParams(nextParams, { replace: true });
    setShowAllCards(false);
  }

  const seasonsQuery = useQuery({ queryKey: ["seasons"], queryFn: fetchSeasons });

  // "All seasons" (the default) means "soonest upcoming games" — with a
  // full season's worth of future games ingested, an unscoped fetch would
  // otherwise return page after page of nothing but upcoming games before
  // any older completed one had a chance to show, which is exactly what
  // made the old All/Upcoming/Completed buttons redundant next to this
  // dropdown (removed — see PredictionsPage's own history). Selecting a
  // specific season switches to that season's own full mix (its own
  // upcoming games, if it has any, then its completed ones), since a
  // single season doesn't have the "buried by 1000+ future games" problem.
  //
  // segment narrows further to one season type (regular/play-in/playoffs/
  // finals); omitted (ALL_SEGMENTS) means every segment mixed, matching
  // GamesService.getGames' own "no seasonType filter" default.
  const gamesQuery = useQuery({
    queryKey: ["games", { pageSize: GAMES_TO_FETCH, season: seasonFilter, segment }],
    queryFn: () =>
      fetchGames({
        pageSize: GAMES_TO_FETCH,
        status: seasonFilter === "all" ? "upcoming" : "all",
        ...(seasonFilter !== "all" ? { season: seasonFilter } : {}),
        seasonType: toSeasonTypeParam(segment),
      }),
  });

  // Independent of gamesQuery's own season/status filter — see
  // RECENT_GAMES_TO_FETCH's doc comment above for why the track-record
  // sections can't just reuse whatever the main card grid happens to be
  // showing.
  const recentGamesQuery = useQuery({
    queryKey: ["games", { pageSize: RECENT_GAMES_TO_FETCH, status: "completed" as const }],
    queryFn: () => fetchGames({ pageSize: RECENT_GAMES_TO_FETCH, status: "completed" }),
  });

  const games = gamesQuery.data?.data ?? [];
  const recentGames = recentGamesQuery.data?.data ?? [];

  const filteredGames = useMemo(() => games.filter((game) => matchesSearch(game, searchQuery)), [games, searchQuery]);

  const visibleGames = showAllCards ? filteredGames : filteredGames.slice(0, CARDS_PAGE_SIZE);

  const recentResults = useMemo(
    () =>
      recentGames
        .filter(isCompleted)
        .slice()
        .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())
        .slice(0, 6),
    [recentGames]
  );

  const recentForm = useMemo(() => computeRecentForm(recentGames), [recentGames]);
  const teamInsights = useMemo(() => computeTeamInsights(recentGames), [recentGames]);
  const longestStreak = useMemo(() => computeLongestStreak(recentForm), [recentForm]);
  const highConfidenceAccuracy = useMemo(() => computeHighConfidenceAccuracy(recentGames), [recentGames]);

  const upcomingCards = useUpcomingPlayerReliability();

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8">
        {/* Hero — explains the page and how to read it, the same job the
            homepage's own opening band does, not a second landing-page
            hero (no photo, nothing viewport-filling). */}
        <div className="mb-6 border border-landing-light bg-locker-surface p-6">
          <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">Predictions</h1>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-locker-ink-muted">
            Elo-based win probability and Four Factors-based predicted margin for every ingested game. Cards for
            games already played show whether the model actually called it right. Search a team or pick a season
            below, or open any card for the full breakdown — predicted top scorers, an illustrative court formation,
            and a chance to try your own scorer predictions.
          </p>
        </div>

        <ModelHighlightsSection />

        {/* Recent results + accuracy-by-confidence, side by side — the
            page's own track record before asking anyone to trust the live
            predictions below it. Gated on recentGames (its own dedicated,
            always-completed-games fetch), not the main, possibly season/
            status-filtered `games` list below. */}
        {recentGames.length > 0 && (
          <div className="mb-6 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            <section>
              <div className="mb-3 flex items-center gap-3.5">
                <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
                  Recent results
                </h2>
                <span aria-hidden className="h-px flex-1 bg-landing-light" />
              </div>
              {recentResults.length === 0 ? (
                <p className="border border-dashed border-landing-light bg-locker-surface p-5 text-center text-[12.5px] text-locker-ink-muted">
                  No completed games yet.
                </p>
              ) : (
                <div className="border border-landing-light bg-locker-surface">
                  {recentResults.map((game) => {
                    const hit = game.prediction ? wasModelHit(game, game.prediction) : null;
                    return (
                      <Link
                        key={game.id}
                        to={`/games/${game.id}`}
                        className="flex flex-wrap items-center gap-3 border-b border-landing-light px-4 py-2.5 last:border-b-0 hover:bg-landing-hero"
                      >
                        <span className="flex items-center gap-1.5">
                          <TeamBadge team={game.awayTeam} size="sm" />
                          <span className="font-display text-[13px] text-landing-ink uppercase">
                            {game.awayTeam.abbreviation}
                          </span>
                        </span>
                        <span className="font-mono text-[10px] text-locker-ink-muted">@</span>
                        <span className="flex items-center gap-1.5">
                          <TeamBadge team={game.homeTeam} size="sm" />
                          <span className="font-display text-[13px] text-landing-ink uppercase">
                            {game.homeTeam.abbreviation}
                          </span>
                        </span>
                        <span className="font-mono text-[10.5px] tracking-[0.08em] text-locker-ink-muted uppercase">
                          {game.awayScore}–{game.homeScore}
                        </span>
                        {hit !== null && (
                          <span className="ml-auto">
                            <HitMissPill hit={hit} />
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="border border-landing-light bg-locker-surface p-4">
              <div className="mb-3 flex items-center gap-3.5">
                <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
                  Model track record
                </h2>
                <span aria-hidden className="h-px flex-1 bg-landing-light" />
              </div>
              {recentForm.length === 0 ? (
                <p className="border border-dashed border-landing-light bg-landing-hero p-5 text-center text-[12.5px] text-locker-ink-muted">
                  No completed games yet.
                </p>
              ) : (
                <>
                  {/* Led with on purpose: a plain N/20 headline doesn't
                      distinguish a confident call from a toss-up, and says
                      nothing about a real hot streak buried inside it. Both
                      numbers below are real, computed from these same
                      completed games — not a separate cherry-picked stat. */}
                  <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div className="border border-landing-light bg-landing-hero px-3 py-2.5">
                      <div className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                        Longest correct streak
                      </div>
                      <div className="mt-1 font-display text-2xl text-locker-good tabular-nums">
                        {longestStreak} {longestStreak === 1 ? "game" : "games"}
                      </div>
                    </div>
                    <div className="border border-landing-light bg-landing-hero px-3 py-2.5">
                      <div className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                        When confident (70%+), right
                      </div>
                      {highConfidenceAccuracy.hitRate !== null ? (
                        <div
                          className={`mt-1 font-display text-2xl tabular-nums ${
                            highConfidenceAccuracy.hitRate >= 0.6 ? "text-locker-good" : "text-landing-ink"
                          }`}
                        >
                          {PERCENT(highConfidenceAccuracy.hitRate)}{" "}
                          <span className="text-[13px] text-locker-ink-muted">
                            ({highConfidenceAccuracy.hits}/{highConfidenceAccuracy.total})
                          </span>
                        </div>
                      ) : (
                        <div className="mt-1 text-[12.5px] text-locker-ink-muted">
                          Not enough high-confidence calls yet ({highConfidenceAccuracy.total}/
                          {HIGH_CONFIDENCE_MIN_GAMES})
                        </div>
                      )}
                    </div>
                  </div>

                  <RecentFormStrip form={recentForm} />
                  <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <TeamInsightCard
                      label="Most predictable"
                      record={teamInsights.mostPredictable}
                      tone="good"
                      emptyReason="Needs a few more completed games before a team stands out."
                      description={(record) =>
                        `The model has called ${record.team.name} games right ${PERCENT(record.hitRate)} of the time.`
                      }
                    />
                    <TeamInsightCard
                      label="Biggest outlier"
                      record={teamInsights.outlier}
                      tone="bad"
                      emptyReason="No team is a clear outlier yet — needs a few more completed games."
                      description={(record) =>
                        `The model has struggled with ${record.team.name}, right only ${PERCENT(record.hitRate)} of the time.`
                      }
                    />
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {/* Filter + search */}
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 border border-landing-light bg-landing-hero px-2.5 py-1.5">
            <Search aria-hidden className="size-3.5 text-locker-ink-muted" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setShowAllCards(false);
              }}
              placeholder="Search a team"
              aria-label="Search games by team"
              className="w-40 bg-transparent text-[12.5px] text-landing-ink placeholder:text-locker-ink-muted focus:outline-none"
            />
          </div>
          <select
            value={seasonFilter}
            onChange={(event) => {
              setSeasonFilter(event.target.value);
              setShowAllCards(false);
            }}
            aria-label="Filter games by season"
            className="border border-landing-light bg-landing-hero px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] text-landing-ink uppercase focus:outline-none"
          >
            <option value="all">Upcoming games</option>
            {(seasonsQuery.data ?? []).map((season) => (
              <option key={season} value={season}>
                {season}
              </option>
            ))}
          </select>
          <SeasonSegmentControl
            value={segment}
            onChange={selectSegment}
            options={GAME_SEGMENT_OPTIONS}
            label="Season segment"
          />
        </div>

        {/* Postseason games are ingested but deliberately excluded from every
            model input (see apps/predictor), so they carry no prediction.
            Said plainly here rather than leaving a column of "No prediction
            yet" looking like something failed. */}
        {isPostseasonSegment && (
          <p className="mb-4 border border-landing-light bg-locker-surface px-4 py-3 text-[12.5px] text-locker-ink-muted">
            {formatSeasonType(segment)} games are shown for reference only. The Elo and Four Factors models are
            trained on regular-season games alone, so no predictions are generated for the postseason.
          </p>
        )}

        {gamesQuery.isPending && (
          <div className="flex min-h-[16rem] items-center justify-center">
            <BasketballSpinner size="lg" label="Loading predictions" />
          </div>
        )}

        {gamesQuery.isError && <ErrorState message="Could not load games." onRetry={() => gamesQuery.refetch()} />}

        {gamesQuery.isSuccess && (
          <>
            {filteredGames.length === 0 ? (
              <p className="border border-dashed border-landing-light bg-locker-surface p-6 text-center text-[12.5px] text-locker-ink-muted">
                No games match that search.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleGames.map((game) => (
                    <GamePredictionCard key={game.id} game={game} prediction={game.prediction} />
                  ))}
                </div>
                {filteredGames.length > CARDS_PAGE_SIZE && (
                  <div className="mt-5 flex justify-center">
                    {showAllCards ? (
                      <button
                        type="button"
                        onClick={() => setShowAllCards(false)}
                        className="border border-landing-light bg-locker-surface px-5 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather"
                      >
                        Show less
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowAllCards(true)}
                        className="border border-landing-light bg-locker-surface px-5 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather"
                      >
                        View more ({filteredGames.length - CARDS_PAGE_SIZE} more)
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="mt-8">
              <PlayerCardsDisplay
                title="Top 5 to watch"
                description="The model's standout predicted scorers across the soonest upcoming games — man of the match and consistency picks, pooled across games rather than scoped to just one."
                players={upcomingCards.players}
                isPending={upcomingCards.isPending}
                count={5}
              />
            </div>

            <div className="mt-8">
              <TailoredForYouSection />
            </div>

            <div className="mt-8">
              <HowItWorksSection />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
