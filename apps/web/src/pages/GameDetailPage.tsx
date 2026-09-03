import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchGameDetail } from "@/lib/nbaApi";
import { ErrorState } from "@/components/ErrorState";
import { TeamBadge } from "@/components/TeamBadge";
import { CourtView } from "@/components/CourtView";
import { Card, CardContent } from "@/components/ui/card";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Game, PredictedScorer } from "@/types/nba";

function formatWinProbability(homeWinProbability: number, homeTeam: Game["homeTeam"], awayTeam: Game["awayTeam"]): string {
  const favored = homeWinProbability >= 0.5 ? homeTeam : awayTeam;
  const percent = Math.round((homeWinProbability >= 0.5 ? homeWinProbability : 1 - homeWinProbability) * 100);
  return `${favored.abbreviation} ${percent}%`;
}

function formatMargin(predictedMarginHome: number | null, homeTeam: Game["homeTeam"], awayTeam: Game["awayTeam"]): string {
  if (predictedMarginHome === null) return "—";
  const favored = predictedMarginHome >= 0 ? homeTeam : awayTeam;
  return `${favored.abbreviation} by ${Math.abs(predictedMarginHome).toFixed(1)}`;
}

interface ScorerRowProps {
  scorer: PredictedScorer;
}

function ScorerRow({ scorer }: ScorerRowProps) {
  return (
    <TableRow>
      <TableCell>
        <Link to={`/players/${scorer.player.id}`} className="text-text-primary hover:text-brand-accent">
          {scorer.player.firstName} {scorer.player.lastName}
        </Link>
      </TableCell>
      <TableCell className="text-text-secondary">
        {scorer.player.team ? (
          <div className="flex items-center gap-2">
            <TeamBadge team={scorer.player.team} size="sm" />
            {scorer.player.team.abbreviation}
          </div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-text-secondary">{scorer.player.position}</TableCell>
      <TableCell className="text-text-secondary">{scorer.predictedPoints}</TableCell>
      <TableCell className="text-text-muted">{scorer.gamesConsidered}</TableCell>
    </TableRow>
  );
}

export function GameDetailPage() {
  const { gameId } = useParams<{ gameId: string }>();

  const gameQuery = useQuery({
    queryKey: ["gameDetail", gameId],
    queryFn: () => fetchGameDetail(gameId!),
    enabled: !!gameId,
  });

  if (gameQuery.isPending) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center p-6">
        <BasketballSpinner size="lg" label="Loading game" />
      </div>
    );
  }

  if (gameQuery.isError) {
    return <ErrorState message="Could not load this game." onRetry={() => gameQuery.refetch()} />;
  }

  const game = gameQuery.data;
  const { prediction, predictedScorers } = game;

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-lg font-semibold text-text-primary">
          <TeamBadge team={game.homeTeam} size="md" />
          <span>{game.homeTeam.city} {game.homeTeam.name}</span>
          <span className="text-text-muted">vs</span>
          <TeamBadge team={game.awayTeam} size="md" />
          <span>{game.awayTeam.city} {game.awayTeam.name}</span>
        </div>
        {game.homeScore !== null && game.awayScore !== null && (
          <div className="text-sm text-text-secondary">
            Final: {game.homeTeam.abbreviation} {game.homeScore} — {game.awayScore} {game.awayTeam.abbreviation}
          </div>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-text-muted">Win probability</div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">
              {prediction ? formatWinProbability(prediction.homeWinProbability, game.homeTeam, game.awayTeam) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-text-muted">Predicted margin</div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">
              {prediction ? formatMargin(prediction.predictedMarginHome, game.homeTeam, game.awayTeam) : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {!prediction && (
        <p className="mb-6 text-sm text-text-muted">
          No win probability has been generated for this game yet — run{" "}
          <code className="rounded bg-surface-raised px-1.5 py-0.5 text-text-primary">predict_games.py</code> in{" "}
          <code className="rounded bg-surface-raised px-1.5 py-0.5 text-text-primary">apps/predictor</code>.
        </p>
      )}

      <h2 className="mb-2 text-sm font-medium text-text-secondary">Predicted top scorers</h2>
      {predictedScorers.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-text-secondary">
            Not enough game history yet for either roster to predict scoring for this matchup.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="p-4">
              {/* A predicted starting five isn't tracked positional data —
                  see CourtView's own docstring. This is a schematic,
                  illustrative formation by role, not a claim about where
                  anyone will actually stand. */}
              <CourtView
                homeTeam={game.homeTeam}
                awayTeam={game.awayTeam}
                homeScorers={predictedScorers.filter((scorer) => scorer.player.teamId === game.homeTeamId)}
                awayScorers={predictedScorers.filter((scorer) => scorer.player.teamId === game.awayTeamId)}
              />
              <p className="mt-3 text-center text-xs text-text-muted">
                Illustrative formation by predicted top scorers&apos; position — not tracked player positioning.
              </p>
            </CardContent>
          </Card>

          <div className="overflow-hidden rounded-xl border border-border-subtle">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Predicted Points</TableHead>
                  <TableHead>Games Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-surface-card">
                {predictedScorers.map((scorer) => (
                  <ScorerRow key={scorer.player.id} scorer={scorer} />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
