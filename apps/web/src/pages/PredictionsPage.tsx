import { useQueries, useQuery } from "@tanstack/react-query";
import { fetchGamePrediction, fetchGames } from "@/lib/nbaApi";
import { ApiError } from "@/lib/apiClient";
import { ErrorState } from "@/components/ErrorState";
import { TeamBadge } from "@/components/TeamBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Game, GamePrediction } from "@/types/nba";

// How many recent games to show predictions for. Accepting one request per
// game (rather than adding a bulk-predictions endpoint) is fine at this
// data volume — see apps/predictor/README.md's note on seed data size;
// revisit if game volume grows enough to make N+1 requests actually slow.
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
  prediction: GamePrediction | undefined;
  isPending: boolean;
  isError: boolean;
}

function GamePredictionRow({ game, prediction, isPending, isError }: GamePredictionRowProps) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <TeamBadge team={game.homeTeam} size="sm" />
          <span>{game.homeTeam.abbreviation}</span>
          <span className="text-text-muted">vs</span>
          <TeamBadge team={game.awayTeam} size="sm" />
          <span>{game.awayTeam.abbreviation}</span>
        </div>

        {isPending ? (
          <Skeleton className="h-6 w-40" />
        ) : isError || !prediction ? (
          <span className="text-sm text-text-muted">No prediction yet</span>
        ) : (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-text-secondary">{formatWinProbability(prediction.homeWinProbability, game.homeTeam)} win</span>
            <span className="text-text-secondary">
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
  );
}

export function PredictionsPage() {
  const gamesQuery = useQuery({
    queryKey: ["games", { pageSize: GAMES_TO_SHOW }],
    queryFn: () => fetchGames({ pageSize: GAMES_TO_SHOW }),
  });

  const games = gamesQuery.data?.data ?? [];
  const predictionQueries = useQueries({
    queries: games.map((game) => ({
      queryKey: ["gamePrediction", game.id],
      queryFn: () => fetchGamePrediction(game.id),
      enabled: gamesQuery.isSuccess,
      retry: (_failureCount: number, error: unknown) => !(error instanceof ApiError && error.status === 404),
    })),
  });

  if (gamesQuery.isPending) {
    return (
      <div className="p-6">
        <h1 className="mb-1 text-xl font-semibold text-text-primary">Predictions</h1>
        <p className="mb-6 max-w-2xl text-sm text-text-secondary">
          Elo-based win probability and Four Factors-based predicted margin for each game.
        </p>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    );
  }

  if (gamesQuery.isError) {
    return <ErrorState message="Could not load games." onRetry={() => gamesQuery.refetch()} />;
  }

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold text-text-primary">Predictions</h1>
      <p className="mb-6 max-w-2xl text-sm text-text-secondary">
        Elo-based win probability and Four Factors-based predicted margin for each game. Predictions labelled{" "}
        <span className="rounded-full border border-border-subtle px-1.5 py-0.5 text-xs">heuristic</span> use fixed
        weights rather than a fitted regression — there isn&apos;t enough game history yet for a reliable fit. See{" "}
        <code className="rounded bg-surface-raised px-1.5 py-0.5 text-text-primary">apps/predictor</code> for details.
      </p>

      <div className="flex flex-col gap-3">
        {games.map((game, index) => (
          <GamePredictionRow
            key={game.id}
            game={game}
            prediction={predictionQueries[index]?.data}
            isPending={predictionQueries[index]?.isPending ?? true}
            isError={predictionQueries[index]?.isError ?? false}
          />
        ))}
      </div>
    </div>
  );
}
