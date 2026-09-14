import type {
  OpponentSplitEntry,
  PlayerMatchupProjection,
  UpcomingGameProjection,
} from "@/types/nba";

const GAME_DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
};

function formatGameDate(gameDate: string): string {
  return new Date(gameDate).toLocaleDateString("en-US", GAME_DATE_FORMAT_OPTIONS);
}

// The basis line under the projection: the opponent-specific history when
// there is one, otherwise an explicit "no history" note — either way the
// overall rate stays visible so the blend can be read at a glance.
function projectionBasis(
  game: UpcomingGameProjection,
  splits: OpponentSplitEntry[],
  overallPointsPerGame: number,
): string {
  const split = splits.find((entry) => entry.opponent.id === game.opponent.id);
  const overall = `${overallPointsPerGame.toFixed(1)} overall`;
  if (!split) return `No history vs ${game.opponent.abbreviation} · ${overall}`;
  return `${split.pointsPerGame.toFixed(1)} PPG vs ${split.opponent.abbreviation} over ${split.gamesPlayed} ${
    split.gamesPlayed === 1 ? "game" : "games"
  } · ${overall}`;
}

// The headline figure: the nearest unplayed game, its opponent, and the
// opponent-adjusted scoring projection for that specific night.
function NextGameCard({
  game,
  splits,
  overallPointsPerGame,
}: {
  game: UpcomingGameProjection;
  splits: OpponentSplitEntry[];
  overallPointsPerGame: number;
}) {
  return (
    <div className="mb-6 border border-landing-light bg-landing-hero p-4">
      <p className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
        Next game · {formatGameDate(game.gameDate)}
      </p>
      <p className="mt-1 font-display text-lg tracking-[0.01em] text-landing-ink uppercase">
        {game.isHome ? "vs" : "at"} {game.opponent.name}
      </p>
      <p className="mt-2 font-display text-4xl text-locker-leather">{game.projectedPoints.toFixed(1)}</p>
      <p className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
        Projected points
      </p>
      <p className="mt-2 text-[12.5px] text-locker-ink-muted">
        {projectionBasis(game, splits, overallPointsPerGame)}
      </p>
    </div>
  );
}

// One opponent's scoring bar. The row's aria-label carries the figures for
// assistive tech — the visible text is abbreviation, bar, and numbers.
function OpponentSplitBar({
  split,
  maxPointsPerGame,
}: {
  split: OpponentSplitEntry;
  maxPointsPerGame: number;
}) {
  const barWidthPercent = maxPointsPerGame > 0 ? (split.pointsPerGame / maxPointsPerGame) * 100 : 0;
  return (
    <li
      className="flex items-center gap-2"
      aria-label={`${split.pointsPerGame.toFixed(1)} points per game against ${split.opponent.abbreviation} across ${split.gamesPlayed} games`}
    >
      <span className="w-10 shrink-0 font-mono text-[10px] tracking-[0.08em] text-locker-ink-muted uppercase">
        {split.opponent.abbreviation}
      </span>
      <div className="h-2.5 flex-1 bg-landing-light" aria-hidden>
        <div className="h-2.5 bg-locker-leather" style={{ width: `${barWidthPercent}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right font-mono text-[10.5px] text-landing-ink">
        {split.pointsPerGame.toFixed(1)}
        <span className="text-locker-ink-muted"> · {split.gamesPlayed}g</span>
      </span>
    </li>
  );
}

// The profile page's matchup-analysis section: the next game's opponent-
// adjusted projection up top, then scoring against every opponent faced,
// best first. Both read from one matchup-projection response.
export function MatchupAnalysis({ projection }: { projection: PlayerMatchupProjection }) {
  const nextGame = projection.upcomingGames[0];
  const maxPointsPerGame = projection.splits.reduce(
    (maximum, split) => Math.max(maximum, split.pointsPerGame),
    0,
  );
  return (
    <div>
      {nextGame ? (
        <NextGameCard
          game={nextGame}
          splits={projection.splits}
          overallPointsPerGame={projection.overallPointsPerGame}
        />
      ) : (
        <p className="mb-6 text-[12.5px] text-locker-ink-muted">
          No upcoming games on the schedule for this player's team.
        </p>
      )}
      {projection.splits.length > 0 ? (
        <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {projection.splits.map((split) => (
            <OpponentSplitBar key={split.opponent.id} split={split} maxPointsPerGame={maxPointsPerGame} />
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-locker-ink-muted">No opponent history to analyse yet.</p>
      )}
    </div>
  );
}
