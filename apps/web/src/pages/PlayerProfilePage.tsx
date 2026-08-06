import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchPlayer, fetchPlayerStats } from "../lib/nbaApi";
import { StatTile } from "../components/StatTile";
import { PlayerTraitsRadar } from "../components/PlayerTraitsRadar";
import { PointsTrendChart, type GamePointsDatum } from "../components/PointsTrendChart";
import type { Player, PlayerStatsResponse } from "../types/nba";

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
  const [player, setPlayer] = useState<Player | null>(null);
  const [stats, setStats] = useState<PlayerStatsResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) return;

    Promise.all([fetchPlayer(playerId), fetchPlayerStats(playerId)])
      .then(([playerResult, statsResult]) => {
        setPlayer(playerResult);
        setStats(statsResult);
      })
      .catch(() => setErrorMessage("Could not load player data."));
  }, [playerId]);

  if (errorMessage) {
    return <div className="p-8 text-red-400">{errorMessage}</div>;
  }

  if (!player || !stats) {
    return <div className="p-8 text-text-secondary">Loading player…</div>;
  }

  const { seasonAverages } = stats;

  return (
    <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-3">
      <section className="rounded-xl border border-border-subtle bg-surface-card p-6 xl:col-span-2">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-raised text-2xl font-semibold text-text-secondary">
            {player.firstName[0]}
            {player.lastName[0]}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">
              {player.firstName} {player.lastName}
            </h1>
            <p className="text-sm text-text-secondary">
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
          <PointsTrendChart data={toTrendData(stats.gameLog)} />
        </div>
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-card p-6">
        <h2 className="mb-2 text-sm font-medium text-text-secondary">Player traits</h2>
        <PlayerTraitsRadar seasonAverages={seasonAverages} />
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-card p-6 xl:col-span-3">
        <h2 className="mb-4 text-sm font-medium text-text-secondary">Shooting splits</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="FG%" value={`${seasonAverages.fieldGoalPercentage}%`} />
          <StatTile label="3P%" value={`${seasonAverages.threePointPercentage}%`} />
          <StatTile label="FT%" value={`${seasonAverages.freeThrowPercentage}%`} />
        </div>
      </section>
    </div>
  );
}
