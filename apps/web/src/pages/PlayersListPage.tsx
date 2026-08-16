import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPlayers } from "../lib/nbaApi";
import type { Player } from "../types/nba";

export function PlayersListPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchPlayers()
      .then((result) => setPlayers(result.data))
      .catch(() => setErrorMessage("Could not load players."));
  }, []);

  if (errorMessage) {
    return <div className="p-8 text-red-400">{errorMessage}</div>;
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold text-text-primary">Players</h1>
      <div className="overflow-hidden rounded-xl border border-border-subtle">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-raised text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Team</th>
              <th className="px-4 py-3 font-medium">Position</th>
              <th className="px-4 py-3 font-medium">Jersey</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle bg-surface-card">
            {players.map((player) => (
              <tr key={player.id} className="hover:bg-surface-raised">
                <td className="px-4 py-3">
                  <Link to={`/players/${player.id}`} className="text-text-primary hover:text-brand-accent">
                    {player.firstName} {player.lastName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-text-secondary">{player.team?.name ?? "—"}</td>
                <td className="px-4 py-3 text-text-secondary">{player.position}</td>
                <td className="px-4 py-3 text-text-secondary">#{player.jerseyNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
