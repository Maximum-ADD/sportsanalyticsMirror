import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { fetchGames } from "@/lib/nbaApi";
import { ErrorState } from "@/components/ErrorState";
import { TeamBadge } from "@/components/TeamBadge";
import { SeasonSegmentControl } from "@/components/SeasonSegmentControl";
import { Card, CardContent } from "@/components/ui/card";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import {
  ALL_SEGMENTS,
  SEASON_TYPES_IN_ORDER,
  formatSeasonType,
  parseUrlSegmentSelection,
  toSeasonTypeParam,
  toUrlSegmentSelection,
} from "@/lib/seasonType";
import type { SeasonSegmentSelection } from "@/lib/seasonType";
import type { Game, GamePrediction } from "@/types/nba";

// The games list is the one view that can show a whole season at once — see
// ALL_SEGMENTS. Ordered so "All" reads first, then the season in sequence.
const GAME_SEGMENT_OPTIONS: SeasonSegmentSelection[] = [ALL_SEGMENTS, ...SEASON_TYPES_IN_ORDER];

// How many recent games to show predictions for.
const GAMES_TO_SHOW = 25;

function formatWinProbability(homeWinProbability: number, homeTeam: Game["homeTeam"]): string {
  const percent = Math.round(homeWinProbability * 100);
  return `${homeTeam.abbreviation} ${percent}%`;
}

function formatMargin(predictedMarginHome: number | null, homeTeam: Game["homeTeam"], awayTeam: Game["awayTeam"]): string {
  if (predictedMarginHome === null) return "—";
  const favored = predictedMarginHome >= 0 ? homeTeam : awayTeam;
  return `${favored.abbreviation} by ${Math.abs(predictedMarginHome).toFixed(1)}`;
}

interface GamePredictionRowProps {
  game: Game;
  prediction: GamePrediction | null | undefined;
}

function GamePredictionRow({ game, prediction }: GamePredictionRowProps) {
  return (
    <Link to={`/games/${game.id}`} className="block">
      <Card className="transition-colors hover:border-brand-accent/60">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <TeamBadge team={game.homeTeam} size="sm" />
            <span>{game.homeTeam.abbreviation}</span>
            <span className="text-text-muted">vs</span>
            <TeamBadge team={game.awayTeam} size="sm" />
            <span>{game.awayTeam.abbreviation}</span>
          </div>

          {!prediction ? (
            <span className="text-sm text-text-muted">No prediction yet</span>
          ) : (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-text-secondary">
                {formatWinProbability(prediction.homeWinProbability, game.homeTeam)} win
              </span>
              <span
                className="text-text-muted"
                title="Predicted margin is backtested at ~12.5 points mean absolute error — only marginally better than guessing the leaguewide average margin. Treat as a rough secondary signal, not a precise forecast."
              >
                {formatMargin(prediction.predictedMarginHome, game.homeTeam, game.awayTeam)}
              </span>
              {prediction.marginMethod === "heuristic" && (
                <span
                  className="rounded-full border border-border-subtle px-2 py-0.5 text-xs text-text-muted"
                  title="Not enough game history yet to fit a reliable regression — using fixed literature-informed weights instead."
                >
                  heuristic
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export function PredictionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const segment = parseUrlSegmentSelection(searchParams.get("segment"));
  const isPostseasonSegment = segment !== ALL_SEGMENTS && segment !== "REGULAR";

  function selectSegment(nextSegment: SeasonSegmentSelection) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("segment", toUrlSegmentSelection(nextSegment));
    setSearchParams(nextParams, { replace: true });
  }

  const gamesQuery = useQuery({
    queryKey: ["games", { pageSize: GAMES_TO_SHOW, segment }],
    queryFn: () => fetchGames({ pageSize: GAMES_TO_SHOW, seasonType: toSeasonTypeParam(segment) }),
  });

  if (gamesQuery.isPending) {
    return (
      <div className="p-6">
        <h1 className="mb-1 text-xl font-semibold text-text-primary">Predictions</h1>
        <p className="mb-6 max-w-2xl text-sm text-text-secondary">
          Elo-based win probability and Four Factors-based predicted margin for each game.
        </p>
        <div className="flex min-h-[16rem] items-center justify-center">
          <BasketballSpinner size="lg" label="Loading predictions" />
        </div>
      </div>
    );
  }

  if (gamesQuery.isError) {
    return <ErrorState message="Could not load games." onRetry={() => gamesQuery.refetch()} />;
  }

  const games = gamesQuery.data.data;

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold text-text-primary">Predictions</h1>
      <p className="mb-6 max-w-2xl text-sm text-text-secondary">
        Elo-based win probability and Four Factors-based predicted margin for each game. Predictions labelled{" "}
        <span className="rounded-full border border-border-subtle px-1.5 py-0.5 text-xs">heuristic</span> use fixed
        weights rather than a fitted regression — there isn&apos;t enough game history yet for a reliable fit. See{" "}
        <code className="rounded bg-surface-raised px-1.5 py-0.5 text-text-primary">apps/predictor</code> for details.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
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
        <p className="mb-4 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-xs text-text-secondary">
          {formatSeasonType(segment)} games are shown for reference only. The Elo and Four Factors models are
          trained on regular-season games alone, so no predictions are generated for the postseason.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {games.length === 0 ? (
          <p className="text-sm text-text-muted">
            No {segment === ALL_SEGMENTS ? "" : `${formatSeasonType(segment)} `}games to show.
          </p>
        ) : (
          games.map((game) => <GamePredictionRow key={game.id} game={game} prediction={game.prediction} />)
        )}
      </div>
    </div>
  );
}
