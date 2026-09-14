import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Pencil, X } from "lucide-react";
import { fetchGameDetail, fetchPlayerStats } from "@/lib/nbaApi";
import { ErrorState } from "@/components/ErrorState";
import { TeamBadge, resolveTeamColors } from "@/components/TeamBadge";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { CourtView } from "@/components/CourtView";
import { PlayerCardsDisplay, usePlayerReliability } from "@/components/PlayerCards";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { PageLoading } from "@/components/ui/loading-overlay";
import {
  computeReliability,
  reliabilityToneClass,
  RELIABILITY_GOOD_THRESHOLD,
  RELIABILITY_BAD_THRESHOLD,
  CLOSE_PREDICTION_TOLERANCE,
  type PredictionReliability,
} from "@/lib/reliability";
import type { Game, PredictedScorer } from "@/types/nba";

const PERCENT = (value: number) => `${Math.round(value * 100)}%`;

// Same back-button styling as the player and team profile pages' own
// LOCKER_BUTTON_CLASS — a bordered button with the "←" glyph, not the plain
// text-link-with-icon this page used before.
const LOCKER_BUTTON_CLASS =
  "border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather";

function formatMargin(predictedMarginHome: number | null, homeTeam: Game["homeTeam"], awayTeam: Game["awayTeam"]): string {
  if (predictedMarginHome === null) return "—";
  const favored = predictedMarginHome >= 0 ? homeTeam : awayTeam;
  return `${favored.abbreviation} by ${Math.abs(predictedMarginHome).toFixed(1)}`;
}

interface PlayerDetailPanelProps {
  scorer: PredictedScorer;
  onClose: () => void;
  isEditing: boolean;
  onToggleEditing: () => void;
  onPointsChange: (playerId: string, points: number) => void;
}

// Opens beside the court when a headshot is clicked — reuses PredictedScorer
// data already on the page (name, team, position, predicted points, games
// considered) plus a fetch of the player's own season stats/game log (the
// same GET /v1/players/:id/stats the player profile page already uses) for
// the fantasy-relevant numbers a headshot-and-a-single-number panel didn't
// have room for before. A link through to the full player profile still
// covers anyone who wants the season-long trend chart and full bio.
function PlayerDetailPanel({ scorer, onClose, isEditing, onToggleEditing, onPointsChange }: PlayerDetailPanelProps) {
  const statsQuery = useQuery({
    queryKey: ["playerStats", scorer.player.id],
    queryFn: () => fetchPlayerStats(scorer.player.id),
  });

  const seasonAverages = statsQuery.data?.seasonAverages;
  const reliability = statsQuery.data ? computeReliability(statsQuery.data.gameLog, scorer.predictedPoints) : null;

  return (
    <div className="border border-landing-light bg-locker-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <PlayerHeadshot player={scorer.player} size="lg" className="size-20" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close player details"
          className="text-locker-ink-muted hover:text-landing-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <Link
        to={`/players/${scorer.player.id}`}
        className="font-display text-lg tracking-[0.01em] text-landing-ink uppercase hover:text-locker-leather"
      >
        {scorer.player.firstName} {scorer.player.lastName}
      </Link>
      <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-locker-ink-muted">
        {scorer.player.team && (
          <>
            <TeamBadge team={scorer.player.team} size="sm" className="size-5" />
            {scorer.player.team.city} {scorer.player.team.name}
            <span aria-hidden>·</span>
          </>
        )}
        {scorer.player.position}
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
          For this matchup
        </span>
        <button
          type="button"
          onClick={onToggleEditing}
          className="flex items-center gap-1 font-mono text-[9.5px] tracking-[0.1em] text-locker-ink-muted uppercase hover:text-landing-ink"
        >
          <Pencil aria-hidden className="size-3" />
          {isEditing ? "Done" : "Edit"}
        </button>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-3">
        <div className="border border-landing-light bg-landing-hero px-3 py-2.5">
          <div className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">Predicted pts</div>
          {isEditing ? (
            <input
              aria-label={`Edit predicted points for ${scorer.player.firstName} ${scorer.player.lastName}`}
              type="number"
              value={scorer.predictedPoints}
              onChange={(event) => onPointsChange(scorer.player.id, Number(event.target.value))}
              className="mt-1 w-full border border-landing-light bg-landing-hero px-1 py-0.5 font-display text-2xl text-landing-ink tabular-nums focus:outline-none focus:ring-1 focus:ring-locker-leather"
            />
          ) : (
            <div className="mt-1 font-display text-2xl text-landing-ink tabular-nums">{scorer.predictedPoints}</div>
          )}
        </div>
        <div className="border border-landing-light bg-landing-hero px-3 py-2.5">
          <div className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">Games used</div>
          <div className="mt-1 font-display text-2xl text-landing-ink tabular-nums">{scorer.gamesConsidered}</div>
        </div>
      </div>
      {isEditing && (
        <p className="mt-2 text-[10.5px] text-locker-ink-muted">
          Editing locally — not saved, resets on refresh. Win probability and margin above are unaffected.
        </p>
      )}

      <div className="mt-5">
        <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">This season</span>
        {statsQuery.isPending && (
          <div className="mt-2 flex justify-center py-4">
            <BasketballSpinner size="sm" label="Loading season stats" />
          </div>
        )}
        {statsQuery.isError && <p className="mt-1.5 text-[11px] text-locker-ink-muted">Season stats unavailable.</p>}
        {seasonAverages && (
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {[
              ["PPG", seasonAverages.pointsPerGame.toFixed(1)],
              ["RPG", seasonAverages.reboundsPerGame.toFixed(1)],
              ["APG", seasonAverages.assistsPerGame.toFixed(1)],
              ["MPG", seasonAverages.minutesPerGame.toFixed(1)],
              ["FG%", PERCENT(seasonAverages.fieldGoalPercentage)],
              ["3P%", PERCENT(seasonAverages.threePointPercentage)],
            ].map(([label, value]) => (
              <div key={label} className="border border-landing-light bg-landing-hero px-2 py-2 text-center">
                <div className="font-mono text-[8.5px] tracking-[0.08em] text-locker-ink-muted uppercase">
                  {label}
                </div>
                <div className="mt-0.5 font-display text-[15px] text-landing-ink tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {reliability && reliability.totalGames > 0 && (
        <div className="mt-5 border border-landing-light bg-landing-hero p-3">
          <div className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
            Prediction reliability
          </div>
          <div className={`mt-1 font-display text-xl tabular-nums ${reliabilityToneClass(reliability.rate)}`}>
            {reliability.closeGames}/{reliability.totalGames}{" "}
            <span className="font-mono text-[10.5px] tracking-[0.05em] text-locker-ink-muted uppercase">
              recent games within {CLOSE_PREDICTION_TOLERANCE} pts of {scorer.predictedPoints}
            </span>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-snug text-locker-ink-muted">
            <span className="font-semibold text-locker-good">High</span> ({PERCENT(RELIABILITY_GOOD_THRESHOLD)}+)
            means {scorer.player.firstName} scores in a tight, predictable band — trust today&apos;s number.{" "}
            <span className="font-semibold text-locker-bad">Low</span> (under {PERCENT(RELIABILITY_BAD_THRESHOLD)})
            means he swings game to game, so treat it as a rougher guess.
          </p>
        </div>
      )}

      <Link
        to={`/players/${scorer.player.id}`}
        className="mt-5 block border border-landing-light px-3 py-2 text-center font-mono text-[10px] tracking-[0.12em] text-locker-ink-muted uppercase hover:border-locker-leather hover:text-landing-ink"
      >
        Full player profile
      </Link>
    </div>
  );
}

const FANTASY_WATCH_COUNT = 3;
const FANTASY_CHART_BAR_MAX_THICKNESS = 22;
const FANTASY_CHART_HEIGHT = 130;

interface FantasyWatchSectionProps {
  scorers: PredictedScorer[];
  homeTeam: Game["homeTeam"];
  awayTeam: Game["awayTeam"];
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
  reliabilityByPlayerId: Map<string, PredictionReliability>;
}

// "Most promising players for your fantasy league" from data already on
// this page — no new fetch, no invented confidence score. Ranked by
// predicted points (the one number this page actually produces per
// player), with gamesConsidered surfaced next to each pick so a thin
// sample reads as thin rather than as a confident recommendation. Any pick
// with a reliability read at or above RELIABILITY_GOOD_THRESHOLD gets a
// small "Reliable" tag — the same real number the player detail panel
// shows, surfaced here so it's visible before clicking through.
function FantasyWatchSection({
  scorers,
  homeTeam,
  awayTeam,
  selectedPlayerId,
  onSelectPlayer,
  reliabilityByPlayerId,
}: FantasyWatchSectionProps) {
  const homeColors = resolveTeamColors(homeTeam.abbreviation);
  const awayColors = resolveTeamColors(awayTeam.abbreviation);

  const ranked = scorers
    .slice()
    .sort((a, b) => b.predictedPoints - a.predictedPoints);
  const watchList = ranked.slice(0, FANTASY_WATCH_COUNT);
  const maxPredicted = Math.max(...ranked.map((scorer) => scorer.predictedPoints), 1);

  return (
    <section className="border border-landing-light bg-locker-surface p-5">
      <div className="mb-1 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          Fantasy watch
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
      </div>
      <p className="mb-4 text-[11px] leading-relaxed text-locker-ink-muted">
        Ranked by predicted points for this matchup. A pick backed by more games considered is a steadier bet — a
        thin sample can still swing hard either way, so weigh it against &ldquo;games used&rdquo; below.
      </p>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col gap-2">
          {watchList.map((scorer, index) => {
            const isHome = scorer.player.teamId === homeTeam.id;
            const colors = isHome ? homeColors : awayColors;
            const reliability = reliabilityByPlayerId.get(scorer.player.id);
            const isReliable = reliability !== undefined && reliability.rate >= RELIABILITY_GOOD_THRESHOLD;
            return (
              <button
                key={scorer.player.id}
                type="button"
                onClick={() => onSelectPlayer(scorer.player.id)}
                aria-pressed={scorer.player.id === selectedPlayerId}
                className={`flex items-center gap-3 border px-3 py-2.5 text-left transition-colors ${
                  scorer.player.id === selectedPlayerId
                    ? "border-locker-leather bg-landing-hero"
                    : "border-landing-light bg-landing-hero hover:border-locker-leather"
                }`}
              >
                <span
                  className="flex size-6 shrink-0 items-center justify-center font-mono text-[11px] font-bold text-white"
                  style={{ backgroundColor: colors.primary }}
                >
                  {index + 1}
                </span>
                <PlayerHeadshot player={scorer.player} size="sm" className="size-9 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="block truncate font-display text-[13px] tracking-[0.01em] text-landing-ink uppercase">
                      {scorer.player.firstName} {scorer.player.lastName}
                    </span>
                    {isReliable && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 bg-locker-good px-1.5 py-px font-mono text-[8px] tracking-[0.08em] text-white uppercase">
                        Reliable
                      </span>
                    )}
                  </span>
                  <span className="block text-[10.5px] text-locker-ink-muted">
                    {isHome ? homeTeam.abbreviation : awayTeam.abbreviation} · {scorer.gamesConsidered}{" "}
                    {scorer.gamesConsidered === 1 ? "game" : "games"} used
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-lg text-landing-ink tabular-nums">
                    {scorer.predictedPoints}
                  </span>
                  <span className="block font-mono text-[8.5px] tracking-[0.1em] text-locker-ink-muted uppercase">
                    pred pts
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="border border-landing-light bg-landing-hero p-4">
          <div className="flex items-end justify-around gap-2" style={{ height: FANTASY_CHART_HEIGHT }}>
            {ranked.map((scorer) => {
              const isHome = scorer.player.teamId === homeTeam.id;
              const colors = isHome ? homeColors : awayColors;
              return (
                <div key={scorer.player.id} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="font-mono text-[9px] text-locker-ink-muted tabular-nums">
                    {scorer.predictedPoints}
                  </span>
                  <div
                    role="img"
                    aria-label={`${scorer.player.firstName} ${scorer.player.lastName}: ${scorer.predictedPoints} predicted points`}
                    className="w-full rounded-t-[4px]"
                    style={{
                      height: `${Math.max((scorer.predictedPoints / maxPredicted) * (FANTASY_CHART_HEIGHT - 34), 2)}px`,
                      maxWidth: FANTASY_CHART_BAR_MAX_THICKNESS,
                      backgroundColor: colors.primary,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-around gap-2">
            {ranked.map((scorer) => (
              <span
                key={scorer.player.id}
                className="flex-1 truncate text-center font-mono text-[8.5px] tracking-[0.05em] text-locker-ink-muted uppercase"
              >
                {scorer.player.lastName}
              </span>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 border-t border-landing-light pt-3 font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: awayColors.primary }} aria-hidden />
              {awayTeam.abbreviation}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: homeColors.primary }} aria-hidden />
              {homeTeam.abbreviation}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// Stable reference so useQueries below doesn't see a "new" empty array (and
// so re-derive its query list) on every render before gameQuery resolves.
const EMPTY_SCORERS: PredictedScorer[] = [];

export function GameDetailPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();

  // Browser-back when there is history to return to (the usual path in from
  // the predictions list) — same pattern as the player and team profile
  // pages' own goBack. A direct landing has no in-app history, so the
  // fallback goes to the predictions list rather than navigating away from
  // the app entirely.
  function goBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate("/predictions");
  }

  const gameQuery = useQuery({
    queryKey: ["gameDetail", gameId],
    queryFn: () => fetchGameDetail(gameId!),
    enabled: !!gameId,
  });

  // Local, never-persisted overrides for predicted scorer points — the only
  // per-game number this app exposes to the client (win probability and
  // predicted margin come from a separate model with no client-side
  // formula, so they can't react to this and stay frozen). Edited from
  // inside PlayerDetailPanel, one player at a time, rather than a page-wide
  // edit mode over a full roster list.
  const [isEditingScorer, setIsEditingScorer] = useState(false);
  const [pointsOverrides, setPointsOverrides] = useState<Record<string, number>>({});

  // Clicking a headshot on the court opens a profile-style panel beside it,
  // reusing PredictedScorer data already on the page (name, team, position,
  // predicted points, games considered) rather than a new fetch — see
  // PlayerDetailPanel below.
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  useEffect(() => {
    setIsEditingScorer(false);
    setPointsOverrides({});
    setSelectedPlayerId(null);
  }, [gameId]);

  // Called unconditionally (before the isPending/isError early returns
  // below) since it's a hook — falls back to EMPTY_SCORERS until the game
  // itself has loaded, which usePlayerReliability handles as "nothing to
  // fetch yet" rather than an error.
  const loadedGame = gameQuery.data;
  const reliability = usePlayerReliability({
    scorers: loadedGame?.predictedScorers ?? EMPTY_SCORERS,
    teamOf: (scorer) =>
      scorer.player.teamId === loadedGame?.homeTeamId ? loadedGame!.homeTeam : loadedGame!.awayTeam,
  });

  if (gameQuery.isPending) {
    return (
      <div className="min-h-full bg-landing-hero p-6">
        <PageLoading label="Loading game" />
      </div>
    );
  }

  if (gameQuery.isError) {
    return <ErrorState message="Could not load this game." onRetry={() => gameQuery.refetch()} />;
  }

  const game = gameQuery.data;
  const { prediction, predictedScorers } = game;
  const effectiveScorers = predictedScorers.map((scorer) => ({
    ...scorer,
    predictedPoints: pointsOverrides[scorer.player.id] ?? scorer.predictedPoints,
  }));
  const hasPointsOverrides = Object.keys(pointsOverrides).length > 0;
  const selectedScorer = effectiveScorers.find((scorer) => scorer.player.id === selectedPlayerId) ?? null;
  const reliabilityByPlayerId = new Map(
    reliability.players
      .filter((entry): entry is typeof entry & { reliability: PredictionReliability } => entry.reliability !== null)
      .map((entry) => [entry.scorer.player.id, entry.reliability])
  );

  function setScorerPoints(playerId: string, points: number) {
    setPointsOverrides((previous) => ({ ...previous, [playerId]: points }));
  }

  function selectPlayer(playerId: string | null) {
    setSelectedPlayerId(playerId);
    setIsEditingScorer(false);
  }

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8">
        <button type="button" onClick={goBack} className={`mb-4 ${LOCKER_BUTTON_CLASS}`}>
          ← Back
        </button>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <TeamBadge team={game.awayTeam} size="md" />
            <span className="font-display text-lg tracking-[0.01em] text-landing-ink uppercase">
              {game.awayTeam.city} {game.awayTeam.name}
            </span>
            <span className="font-mono text-[11px] text-locker-ink-muted">@</span>
            <span className="font-display text-lg tracking-[0.01em] text-landing-ink uppercase">
              {game.homeTeam.city} {game.homeTeam.name}
            </span>
            <TeamBadge team={game.homeTeam} size="md" />
          </div>
          {game.homeScore !== null && game.awayScore !== null && (
            <div className="font-mono text-[11px] tracking-[0.1em] text-locker-ink-muted uppercase">
              Final: {game.awayTeam.abbreviation} {game.awayScore} — {game.homeScore} {game.homeTeam.abbreviation}
            </div>
          )}
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="border border-landing-light bg-landing-hero px-4 py-3">
            <div className="font-mono text-[10.5px] tracking-[0.1em] text-locker-ink-muted uppercase">
              Win probability
            </div>
            <div className="mt-1 font-display text-[27px] text-landing-ink tabular-nums">
              {prediction ? (
                <>
                  {(prediction.homeWinProbability >= 0.5 ? game.homeTeam : game.awayTeam).abbreviation}{" "}
                  {PERCENT(
                    prediction.homeWinProbability >= 0.5
                      ? prediction.homeWinProbability
                      : 1 - prediction.homeWinProbability
                  )}
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div
            className="border border-landing-light bg-landing-hero px-4 py-3"
            title="Backtested at ~12.5 points mean absolute error — only marginally better than guessing the leaguewide average margin. Treat this as a rough secondary signal, not a precise forecast."
          >
            <div className="font-mono text-[10.5px] tracking-[0.1em] text-locker-ink-muted uppercase">
              Predicted margin (low confidence)
            </div>
            <div className="mt-1 font-display text-[27px] text-landing-ink tabular-nums">
              {prediction ? formatMargin(prediction.predictedMarginHome, game.homeTeam, game.awayTeam) : "—"}
            </div>
          </div>
        </div>

        {!prediction && (
          <p className="mb-6 text-[12.5px] text-locker-ink-muted">
            No win probability has been generated for this game yet — run{" "}
            <code className="border border-landing-light bg-locker-surface px-1.5 py-0.5 text-landing-ink">
              predict_games.py
            </code>{" "}
            in{" "}
            <code className="border border-landing-light bg-locker-surface px-1.5 py-0.5 text-landing-ink">
              apps/predictor
            </code>
            .
          </p>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-3.5">
          <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
            Predicted top scorers
          </h2>
          <span aria-hidden className="h-px flex-1 bg-landing-light" />
          {hasPointsOverrides && (
            <button
              type="button"
              onClick={() => setPointsOverrides({})}
              className="font-mono text-[10.5px] tracking-[0.1em] text-locker-ink-muted uppercase hover:text-landing-ink"
            >
              Reset edited points
            </button>
          )}
        </div>

        {predictedScorers.length === 0 ? (
          <div className="border border-landing-light bg-locker-surface p-6 text-[12.5px] text-locker-ink-muted">
            Not enough game history yet for either roster to predict scoring for this matchup.
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {/* Court on the left, a player-profile panel on the right that
                opens when a headshot is clicked — the court stays on its
                original dark tactical-board palette on purpose, a
                deliberate contrast panel against the warm page, the same
                "spend the dark/leather treatment once, on purpose" rule the
                homepage's leather CTAs follow, rather than a re-skin that
                would flatten the two apart. */}
            <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="border border-landing-light bg-locker-surface p-5">
                <CourtView
                  homeTeam={game.homeTeam}
                  awayTeam={game.awayTeam}
                  homeScorers={effectiveScorers.filter((scorer) => scorer.player.teamId === game.homeTeamId)}
                  awayScorers={effectiveScorers.filter((scorer) => scorer.player.teamId === game.awayTeamId)}
                  selectedPlayerId={selectedPlayerId}
                  onSelectPlayer={(scorer) => selectPlayer(scorer.player.id)}
                />
                <p className="mt-3 text-center text-[10.5px] text-locker-ink-muted">
                  Illustrative formation by predicted top scorers&apos; position — not tracked player positioning.
                  Click a player to see their predicted stats.
                </p>
              </div>

              {selectedScorer ? (
                <PlayerDetailPanel
                  scorer={selectedScorer}
                  onClose={() => selectPlayer(null)}
                  isEditing={isEditingScorer}
                  onToggleEditing={() => setIsEditingScorer((previous) => !previous)}
                  onPointsChange={setScorerPoints}
                />
              ) : (
                <div className="hidden items-center justify-center border border-dashed border-landing-light bg-locker-surface p-5 text-center text-[11.5px] text-locker-ink-muted xl:flex">
                  Click a player on the court to see their predicted stats here.
                </div>
              )}
            </div>

            <FantasyWatchSection
              scorers={effectiveScorers}
              homeTeam={game.homeTeam}
              awayTeam={game.awayTeam}
              selectedPlayerId={selectedPlayerId}
              onSelectPlayer={selectPlayer}
              reliabilityByPlayerId={reliabilityByPlayerId}
            />

            <PlayerCardsDisplay
              title="Player cards"
              description="Highlights for this matchup, pulled from the same predicted points and prediction reliability shown above."
              players={reliability.players}
              isPending={reliability.isPending}
            />
          </div>
        )}
      </div>
    </div>
  );
}
