import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Pagination } from "@/components/Pagination";
import { ProRankBadge } from "@/components/becomepro/ProRankBadge";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  PROSPECT_LEADERBOARD_QUERY_KEY,
  fetchProspectLeaderboard,
} from "@/lib/becomeProApi";
import {
  COMPETITION_LEVEL_SHORT_LABELS,
  formatProjectedValue,
} from "@/lib/prospectValue";
import type { ProspectLeaderboardEntry, ProspectLeaderboardReference } from "@/types/nba";

interface ProspectLeaderboardProps {
  /** Drops the search box and the pager — the Home rail has room for neither. */
  compact?: boolean;
  /** How many rows to request. Only meaningful alongside `compact`. */
  limit?: number;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-landing-light bg-locker-surface p-4">
      <div className="mb-3 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          Value board
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
      </div>
      {children}
    </div>
  );
}

const HEAD_CLASS =
  "pb-1.5 font-mono text-[9px] tracking-[0.14em] text-locker-ink-muted uppercase";

/**
 * Prospects ranked by what their season projects to be worth.
 *
 * Structurally the accuracy leaderboard's sibling (components/home/
 * LeaderboardCard.tsx) and deliberately so: a real table with a screen-reader
 * caption, a qualification floor stated in a footnote, benchmark rows that are
 * identified by a WORD rather than by their background colour, and an empty
 * state that explains itself instead of rendering a blank table.
 *
 * The rookie-scale reference rows are what make a day-one board readable. With
 * no prospects on it yet, "Pick 1 — $12.5M" still tells a visitor what the
 * numbers on this page mean. They are excluded from `total` and never ranked.
 */
export function ProspectLeaderboard({ compact = false, limit }: ProspectLeaderboardProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 400);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [...PROSPECT_LEADERBOARD_QUERY_KEY, { page, search: debouncedSearch, limit }],
    queryFn: () =>
      fetchProspectLeaderboard({
        page: compact ? 1 : page,
        pageSize: limit,
        search: debouncedSearch || undefined,
      }),
  });

  if (isPending) {
    return (
      <Shell>
        <div role="status" aria-label="Loading the value board" className="animate-pulse space-y-1.5">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-6 bg-landing-hero" />
          ))}
        </div>
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <p className="text-[12px] text-locker-bad">Could not load the value board.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 text-[12px] text-locker-leather underline underline-offset-[3px]"
        >
          Try again
        </button>
      </Shell>
    );
  }

  const isEmpty = data.data.length === 0;
  // Shown only when the signed-in user's own row is not already on this page,
  // so their standing is always one glance away without a second request.
  const showYourStanding =
    data.yourStanding !== null && !data.data.some((entry) => entry.isSelf);

  return (
    <Shell>
      {!compact && (
        <div className="mb-3">
          <label htmlFor="prospect-board-search" className="sr-only">
            Search prospects by name
          </label>
          <input
            id="prospect-board-search"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search prospects"
            className="w-full max-w-64 border border-landing-light bg-landing-hero px-3 py-2 text-[13px] text-landing-ink focus:border-locker-leather focus:outline-none"
          />
        </div>
      )}

      <table className="w-full text-left text-[12.5px]">
        <caption className="sr-only">
          Prospects ranked by projected value, highest first, with NBA rookie-scale picks as
          reference points
        </caption>
        <thead>
          <tr className="border-b border-landing-light">
            <th scope="col" className={HEAD_CLASS}>
              #
            </th>
            <th scope="col" className={HEAD_CLASS}>
              Prospect
            </th>
            <th scope="col" className={`${HEAD_CLASS} text-right`}>
              Games
            </th>
            <th scope="col" className={`${HEAD_CLASS} text-right`}>
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((entry) => (
            <ProspectRow key={entry.username} entry={entry} />
          ))}
          {showYourStanding && data.yourStanding && (
            <ProspectRow key="your-standing" entry={data.yourStanding} />
          )}
          {data.references.map((reference) => (
            <ReferenceRow key={reference.label} reference={reference} />
          ))}
        </tbody>
      </table>

      {isEmpty && (
        <p className="mt-3 text-[11px] text-locker-ink-muted">
          Nobody has qualified yet. Log {data.minimumGamesRequired} games and you will be the first
          on the board.
        </p>
      )}

      {!compact && !isEmpty && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
          tone="locker"
        />
      )}

      <p className="mt-3 border-t border-landing-light pt-2.5 text-[11px] text-locker-ink-muted">
        Minimum {data.minimumGamesRequired} logged games to qualify, so one big night cannot top the
        board. Every figure is self-reported and projected against the {data.rookieScaleYear} NBA
        rookie scale — the Pick rows are that scale, not players. Prospects on the same projected
        value share a rank.
      </p>
    </Shell>
  );
}

function ProspectRow({ entry }: { entry: ProspectLeaderboardEntry }) {
  return (
    <tr className={entry.isSelf ? "bg-landing-hero" : undefined}>
      <td className="py-1.5 text-locker-ink-muted tabular-nums">
        <ProRankBadge rank={entry.rank} />
      </td>
      <td className="py-1.5">
        <Link
          to={`/become-pro/${entry.username}`}
          className={
            entry.isSelf
              ? "font-semibold text-locker-you underline-offset-[3px] hover:underline"
              : "text-landing-ink underline-offset-[3px] hover:underline"
          }
        >
          {entry.displayName}
        </Link>
        {/* The word does the work, not the row colour — your own row has to be
            findable in greyscale and to a screen reader too. */}
        {entry.isSelf && (
          <span className="ml-1.5 font-mono text-[8.5px] tracking-[0.12em] text-locker-ink-muted uppercase">
            you
          </span>
        )}
        <span className="ml-1.5 font-mono text-[8.5px] tracking-[0.12em] text-locker-ink-muted uppercase">
          {COMPETITION_LEVEL_SHORT_LABELS[entry.competitionLevel]}
        </span>
      </td>
      <td className="py-1.5 text-right text-locker-ink-muted tabular-nums">{entry.gamesLogged}</td>
      <td
        className={`py-1.5 text-right font-semibold tabular-nums ${
          entry.isSelf ? "text-locker-you" : "text-landing-ink"
        }`}
      >
        {formatProjectedValue(entry.projectedValueUsd)}
      </td>
    </tr>
  );
}

// A rookie-scale anchor, not a person. Carries no rank and no game count,
// because it is the yardstick the board is measured against rather than a
// competitor on it.
function ReferenceRow({ reference }: { reference: ProspectLeaderboardReference }) {
  return (
    <tr className="bg-landing-hero">
      <td className="py-1.5 text-locker-ink-muted" />
      <td className="py-1.5">
        <span className="font-semibold text-locker-model">{reference.label}</span>
        <span className="ml-1.5 font-mono text-[8.5px] tracking-[0.12em] text-locker-ink-muted uppercase">
          reference
        </span>
      </td>
      <td className="py-1.5 text-right text-locker-ink-muted">—</td>
      <td className="py-1.5 text-right font-semibold text-locker-model tabular-nums">
        {formatProjectedValue(reference.valueUsd)}
      </td>
    </tr>
  );
}
