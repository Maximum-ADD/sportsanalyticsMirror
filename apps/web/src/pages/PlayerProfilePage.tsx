import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { fetchPlayer, fetchPlayerStats } from "@/lib/nbaApi";
import { StatTile } from "@/components/StatTile";
import { PlayerTraitsRadar } from "@/components/PlayerTraitsRadar";
import { PointsTrendChart, type GamePointsDatum } from "@/components/PointsTrendChart";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ErrorState";
import { TeamBadge } from "@/components/TeamBadge";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import type { PlayerStatsResponse } from "@/types/nba";

function formatHeight(heightInches: number | null): string {
  if (heightInches === null) return "—";
  const feet = Math.floor(heightInches / 12);
  const inches = heightInches % 12;
  return `${feet}'${inches}"`;
}

function toTrendData(gameLog: PlayerStatsResponse["gameLog"]): GamePointsDatum[] {
  return gameLog.map((entry, index) => ({
    gameLabel: `G${index + 1}`,
    points: entry.points,
  }));
}

export function PlayerProfilePage() {
  const { playerId } = useParams<{ playerId: string }>();

  const playerQuery = useQuery({
    queryKey: ["player", playerId],
    queryFn: () => fetchPlayer(playerId!),
    enabled: !!playerId,
  });

  const statsQuery = useQuery({
    queryKey: ["playerStats", playerId],
    queryFn: () => fetchPlayerStats(playerId!),
    enabled: !!playerId,
  });

  if (playerQuery.isError || statsQuery.isError) {
    return (
      <ErrorState
        message="Could not load player data."
        onRetry={() => {
          playerQuery.refetch();
          statsQuery.refetch();
        }}
      />
    );
  }

  if (playerQuery.isPending || statsQuery.isPending) {
    return (
      <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-3">
        <Skeleton className="h-64 xl:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const player = playerQuery.data;
  const { seasonAverages, gameLog } = statsQuery.data;

  return (
    <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <PlayerHeadshot player={player} size="lg" />
            <div>
              <h1 className="text-xl font-semibold text-text-primary">
                {player.firstName} {player.lastName}
              </h1>
              <p className="flex items-center gap-2 text-sm text-text-secondary">
                {player.team && <TeamBadge team={player.team} size="sm" />}
                {player.team?.city} {player.team?.name} · {player.position} · #{player.jerseyNumber}
              </p>
              <p className="text-sm text-text-muted">Height {formatHeight(player.heightInches)}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="PPG" value={seasonAverages.pointsPerGame} />
            <StatTile label="RPG" value={seasonAverages.reboundsPerGame} />
            <StatTile label="APG" value={seasonAverages.assistsPerGame} />
            <StatTile label="Games" value={seasonAverages.gamesPlayed} />
          </div>

          <div className="mt-6">
            <h2 className="mb-2 text-sm font-medium text-text-secondary">Points trend</h2>
            <PointsTrendChart data={toTrendData(gameLog)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-2 text-sm font-medium text-text-secondary">Player traits</h2>
          <PlayerTraitsRadar seasonAverages={seasonAverages} />
        </CardContent>
      </Card>

      <Card className="xl:col-span-3">
        <CardContent className="p-6">
          <h2 className="mb-4 text-sm font-medium text-text-secondary">Shooting splits</h2>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="FG%" value={`${seasonAverages.fieldGoalPercentage}%`} />
            <StatTile label="3P%" value={`${seasonAverages.threePointPercentage}%`} />
            <StatTile label="FT%" value={`${seasonAverages.freeThrowPercentage}%`} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
