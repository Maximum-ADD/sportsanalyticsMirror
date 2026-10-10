import { TeamBadge } from "@/components/TeamBadge";
import { formatGameClock } from "@/lib/gameClock";
import { formatPlusMinus, formatShootingSplit } from "@/lib/liveGameDisplay";
import type { LivePlayerLine, LiveTeamSummary } from "@/lib/liveGamesApi";

interface BoxScoreColumn {
  label: string;
  // Spelled out for the <abbr> tooltip and screen readers.
  title: string;
  readValue: (player: LivePlayerLine) => string | number;
}

// The plan's column order: MIN, PTS, AST, REB, TO, STL, FG, 3PT, FT, +/-.
const BOX_SCORE_COLUMNS: BoxScoreColumn[] = [
  { label: "MIN", title: "Minutes played", readValue: (player) => formatGameClock(player.minutes) },
  { label: "PTS", title: "Points", readValue: (player) => player.points },
  { label: "AST", title: "Assists", readValue: (player) => player.assists },
  { label: "REB", title: "Rebounds", readValue: (player) => player.rebounds },
  { label: "TO", title: "Turnovers", readValue: (player) => player.turnovers },
  { label: "STL", title: "Steals", readValue: (player) => player.steals },
  {
    label: "FG",
    title: "Field goals made-attempted",
    readValue: (player) => formatShootingSplit(player.fieldGoalsMade, player.fieldGoalsAttempted),
  },
  {
    label: "3PT",
    title: "Three-pointers made-attempted",
    readValue: (player) => formatShootingSplit(player.threePointersMade, player.threePointersAttempted),
  },
  {
    label: "FT",
    title: "Free throws made-attempted",
    readValue: (player) => formatShootingSplit(player.freeThrowsMade, player.freeThrowsAttempted),
  },
  { label: "+/-", title: "Plus/minus", readValue: (player) => formatPlusMinus(player.plusMinus) },
];

const HEADER_CELL_CLASS = "px-2 py-2 text-right font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase";
const STAT_CELL_CLASS = "px-2 py-1.5 text-right font-mono text-[11.5px] text-landing-ink tabular-nums whitespace-nowrap";
// Pinned while the stat columns scroll sideways on a phone, so every row
// keeps its name. Needs its own background, or the scrolled cells show through.
const STICKY_PLAYER_CELL_CLASS = "sticky left-0 z-10 bg-locker-surface";

interface LiveBoxScoreTableProps {
  team: LiveTeamSummary;
  /** Only the players who have taken the floor. */
  players: LivePlayerLine[];
}

/**
 * One team's half of the box score: a row per player who has played, in
 * the NBA's order (starters first, each with their position).
 */
export function LiveBoxScoreTable({ team, players }: LiveBoxScoreTableProps) {
  return (
    <section className="min-w-0 border border-landing-light bg-locker-surface">
      <div className="flex items-center gap-2.5 border-b border-landing-light px-3 py-2.5">
        <TeamBadge team={{ abbreviation: team.tricode, nbaTeamId: team.teamId }} size="sm" />
        <h3 className="font-display text-sm tracking-[0.01em] text-landing-ink uppercase">
          {team.city} {team.name}
        </h3>
      </div>

      {players.length === 0 ? (
        <p className="px-3 py-4 text-[12px] text-locker-ink-muted">No one has played for {team.tricode} yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              {team.city} {team.name} box score
            </caption>
            <thead>
              <tr className="border-b border-landing-light">
                <th scope="col" className={`${HEADER_CELL_CLASS} ${STICKY_PLAYER_CELL_CLASS} text-left`}>
                  Player
                </th>
                {BOX_SCORE_COLUMNS.map((column) => (
                  <th key={column.label} scope="col" className={HEADER_CELL_CLASS}>
                    <abbr title={column.title} className="no-underline">
                      {column.label}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-landing-light/60">
              {players.map((player) => (
                <tr key={player.personId}>
                  <th scope="row" className={`${STICKY_PLAYER_CELL_CLASS} px-2 py-1.5 text-left font-normal whitespace-nowrap`}>
                    <span className="text-[12px] text-landing-ink" title={player.name}>
                      {player.shortName}
                    </span>
                    {player.position && (
                      <span className="ml-1.5 font-mono text-[9px] text-locker-ink-muted">{player.position}</span>
                    )}
                  </th>
                  {BOX_SCORE_COLUMNS.map((column) => (
                    <td key={column.label} className={STAT_CELL_CLASS}>
                      {column.readValue(player)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
