import { useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { Reveal } from "@/components/landing/Reveal";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { PageTutorial } from "@/components/tutorial/PageTutorial";
import { ALL_TIME_LEADERS_TUTORIAL } from "@/components/tutorial/definitions/allTimeLeadersTutorial";
import { PageLoading, SectionLoading } from "@/components/ui/loading-overlay";
import {
  fetchAllTimeLeaders,
  type AllTimeLeaderCategory,
  type AllTimeLeaderEntry,
  type AllTimeLeaderPlayer,
  type AllTimeLeaderSeasonType,
} from "@/lib/allTimeLeadersApi";
import { formatHeight, formatPosition, NO_VALUE } from "@/lib/playerBio";

interface CategoryOption {
  value: AllTimeLeaderCategory;
  label: string;
  // Set for the categories the NBA only began recording partway through its
  // history, so a missing name (Wilt Chamberlain has no blocks) reads as a
  // gap in the records rather than a mistake on the page.
  recordedSince?: string;
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: "POINTS", label: "Points" },
  { value: "ASSISTS", label: "Assists" },
  { value: "REBOUNDS", label: "Total rebounds" },
  { value: "OFFENSIVE_REBOUNDS", label: "Offensive rebounds", recordedSince: "1973-74" },
  { value: "DEFENSIVE_REBOUNDS", label: "Defensive rebounds", recordedSince: "1973-74" },
  { value: "STEALS", label: "Steals", recordedSince: "1973-74" },
  { value: "BLOCKS", label: "Blocks", recordedSince: "1973-74" },
  { value: "THREES_MADE", label: "3-pointers made", recordedSince: "1979-80, the three-point line's first season" },
  { value: "FIELD_GOALS_MADE", label: "Field goals made" },
  { value: "FREE_THROWS_MADE", label: "Free throws made" },
  { value: "GAMES_PLAYED", label: "Games played" },
];

const SEASON_TYPE_OPTIONS: { value: AllTimeLeaderSeasonType; label: string }[] = [
  { value: "REGULAR", label: "Regular season" },
  { value: "PLAYOFFS", label: "Playoffs" },
];

const CHIP_CLASS =
  "min-h-10 border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-locker-leather sm:min-h-0";
const SELECTED_CHIP_CLASS = "border-locker-leather bg-locker-leather text-white";
const UNSELECTED_CHIP_CLASS = "border-landing-light bg-landing-hero text-landing-ink hover:border-locker-leather";
const FACT_LABEL_CLASS = "font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase";

const LAST_TWO_DIGITS = 100;

/** Formats a season by the year it started in, the way the rest of the app does: 1969 → "1969-70". */
function formatSeason(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % LAST_TWO_DIGITS).padStart(2, "0")}`;
}

/** Formats a career total with thousands separators: 43440 → "43,440". */
function formatTotal(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * Formats a birth date as a calendar date. Read in UTC because the API sends
 * midnight UTC, which a local time zone west of Greenwich would show as the
 * day before.
 */
function formatBirthDate(birthDate: string | null): string {
  if (!birthDate) return NO_VALUE;
  return new Date(birthDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** "1969-70 to 1988-89 (20 seasons)", or NO_VALUE until the bio has been fetched. */
function formatCareerSpan(player: AllTimeLeaderPlayer): string {
  if (player.fromYear === null || player.toYear === null) return NO_VALUE;
  const span = `${formatSeason(player.fromYear)} to ${formatSeason(player.toYear)}`;
  return player.seasonExp !== null ? `${span} (${player.seasonExp} seasons)` : span;
}

/** "1969 · Round 1, Pick 1"; the year alone when the pick is unrecorded. */
function formatDraft(player: AllTimeLeaderPlayer): string {
  if (player.draftYear === null) return NO_VALUE;
  if (player.draftRound === null || player.draftNumber === null) return String(player.draftYear);
  return `${player.draftYear} · Round ${player.draftRound}, Pick ${player.draftNumber}`;
}

/** Joins school and country, skipping whichever is missing. */
function formatBackground(player: AllTimeLeaderPlayer): string {
  const parts = [player.school, player.country].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : NO_VALUE;
}

function formatPlayerName(player: AllTimeLeaderPlayer): string {
  return `${player.firstName} ${player.lastName}`.trim();
}

function ChipButton({ isSelected, onClick, children }: { isSelected: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      className={`${CHIP_CLASS} ${isSelected ? SELECTED_CHIP_CLASS : UNSELECTED_CHIP_CLASS}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function PlayerBadges({ player }: { player: AllTimeLeaderPlayer }) {
  if (!player.isActive && !player.isGreatest75) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {player.isActive && (
        <span className="bg-locker-good px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] text-white uppercase">
          Active
        </span>
      )}
      {player.isGreatest75 && (
        <span className="border border-locker-leather px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] text-locker-leather uppercase">
          NBA 75th Anniversary Team
        </span>
      )}
    </div>
  );
}

/** The selected leader's bio: who they are, their total, and a profile link when the app holds them. */
function LeaderBioCard({ entry, categoryLabel }: { entry: AllTimeLeaderEntry; categoryLabel: string }) {
  const { player } = entry;
  const facts = [
    { label: "Position", value: formatPosition(player.position) },
    { label: "Height", value: formatHeight(player.heightInches) },
    { label: "Weight", value: player.weightLbs !== null ? `${player.weightLbs} lb` : NO_VALUE },
    { label: "Born", value: formatBirthDate(player.birthDate) },
    { label: "From", value: formatBackground(player) },
    { label: "Drafted", value: formatDraft(player) },
    { label: "Career", value: formatCareerSpan(player) },
  ];

  return (
    <section aria-label={`${formatPlayerName(player)} bio`} className="border border-landing-light bg-locker-surface p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <PlayerHeadshot player={player} size="lg" alt="" />
        <div className="min-w-0">
          <div className={FACT_LABEL_CLASS}>Rank {entry.rank}</div>
          <h2 className="font-display text-xl tracking-[0.01em] text-landing-ink uppercase">{formatPlayerName(player)}</h2>
          <div className="font-display text-lg text-locker-leather tabular-nums">
            {formatTotal(entry.value)} <span className="font-mono text-[10px] tracking-[0.1em] uppercase">{categoryLabel}</span>
          </div>
          <PlayerBadges player={player} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-landing-light pt-3">
        {facts.map((fact) => (
          <div key={fact.label} className={fact.label === "Career" || fact.label === "From" ? "col-span-2" : undefined}>
            <dt className={FACT_LABEL_CLASS}>{fact.label}</dt>
            <dd className="text-[12.5px] text-landing-ink">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {player.playerId && (
        <Link
          to={`/players/${player.playerId}`}
          className="mt-4 inline-block border border-landing-light px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-landing-ink uppercase transition-colors hover:border-locker-leather"
        >
          Open player profile
        </Link>
      )}
    </section>
  );
}

function LeaderRow({ entry, isSelected, onSelect }: { entry: AllTimeLeaderEntry; isSelected: boolean; onSelect: () => void }) {
  const { player } = entry;
  return (
    <li>
      <button
        type="button"
        aria-pressed={isSelected}
        aria-label={`${entry.rank}. ${formatPlayerName(player)}, ${formatTotal(entry.value)}`}
        className={`flex w-full items-center gap-3 border-b border-landing-light px-3 py-2 text-left transition-colors hover:bg-landing-hero ${
          isSelected ? "bg-landing-hero" : ""
        }`}
        onClick={onSelect}
      >
        <span className="w-6 shrink-0 text-right font-mono text-[11px] text-locker-ink-muted tabular-nums">{entry.rank}</span>
        <PlayerHeadshot player={player} size="sm" alt="" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-landing-ink">{formatPlayerName(player)}</span>
          {player.isActive && (
            <span className="font-mono text-[9px] tracking-[0.1em] text-locker-good uppercase">Active</span>
          )}
        </span>
        <span className="font-display text-base text-landing-ink tabular-nums">{formatTotal(entry.value)}</span>
      </button>
    </li>
  );
}

export function AllTimeLeadersPage() {
  const [category, setCategory] = useState<AllTimeLeaderCategory>("POINTS");
  const [seasonType, setSeasonType] = useState<AllTimeLeaderSeasonType>("REGULAR");
  // Null means "the leader": a new board always opens on its #1.
  const [selectedNbaPlayerId, setSelectedNbaPlayerId] = useState<number | null>(null);
  const bioCardRef = useRef<HTMLDivElement>(null);

  const leadersQuery = useQuery({
    queryKey: ["allTimeLeaders", category, seasonType],
    queryFn: () => fetchAllTimeLeaders(category, seasonType),
    // Keeps the current board on screen while the next one loads, instead of
    // dropping back to the full-page spinner on every chip press.
    placeholderData: keepPreviousData,
  });

  const categoryOption = CATEGORY_OPTIONS.find((option) => option.value === category) ?? CATEGORY_OPTIONS[0];
  const leaders = leadersQuery.data?.leaders ?? [];
  const selectedEntry = leaders.find((entry) => entry.player.nbaPlayerId === selectedNbaPlayerId) ?? leaders[0];
  const fetchedAt = leadersQuery.data?.fetchedAt;

  function changeCategory(nextCategory: AllTimeLeaderCategory) {
    setCategory(nextCategory);
    setSelectedNbaPlayerId(null);
  }

  function changeSeasonType(nextSeasonType: AllTimeLeaderSeasonType) {
    setSeasonType(nextSeasonType);
    setSelectedNbaPlayerId(null);
  }

  // On a phone the bio card sits above the list, so a row far down the list
  // would otherwise change a card the reader can't see.
  function selectPlayer(nbaPlayerId: number) {
    setSelectedNbaPlayerId(nbaPlayerId);
    bioCardRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }

  if (leadersQuery.isError) {
    return <ErrorState message="Could not load the all-time leaders." onRetry={() => leadersQuery.refetch()} />;
  }

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mb-6 border border-landing-light bg-locker-surface p-4 sm:p-6">
            <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">All-time leaders</h1>
            <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-locker-ink-muted">
              The top 20 career totals in NBA history, from the league's own records — not just the seasons this app
              holds. Pick a category, switch between regular-season and playoff totals, and choose a player to see their
              bio.
            </p>
            {fetchedAt && (
              <p className="mt-2 font-mono text-[10px] tracking-[0.1em] text-locker-ink-muted uppercase">
                Updated {new Date(fetchedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
          </div>
        </Reveal>

        <Reveal>
          <div className="mb-5 space-y-3">
            <div role="group" aria-label="Season type" className="flex flex-wrap gap-2">
              {SEASON_TYPE_OPTIONS.map((option) => (
                <ChipButton key={option.value} isSelected={seasonType === option.value} onClick={() => changeSeasonType(option.value)}>
                  {option.label}
                </ChipButton>
              ))}
            </div>
            <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((option) => (
                <ChipButton key={option.value} isSelected={category === option.value} onClick={() => changeCategory(option.value)}>
                  {option.label}
                </ChipButton>
              ))}
            </div>
            {categoryOption.recordedSince && (
              <p className="text-[11px] text-locker-ink-muted">
                The NBA has only recorded {categoryOption.label.toLowerCase()} since {categoryOption.recordedSince}, so
                players from before then are missing from this list.
              </p>
            )}
          </div>
        </Reveal>

        {leadersQuery.isPending ? (
          <PageLoading label="Loading all-time leaders" />
        ) : leaders.length === 0 || !selectedEntry ? (
          <p className="text-[12.5px] text-locker-ink-muted">No all-time leaders have been loaded yet.</p>
        ) : (
          <SectionLoading loading={leadersQuery.isFetching}>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <div ref={bioCardRef} className="lg:sticky lg:top-4 lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:self-start">
                <LeaderBioCard entry={selectedEntry} categoryLabel={categoryOption.label} />
              </div>
              <ol
                aria-label={`${categoryOption.label}, ${seasonType === "REGULAR" ? "regular season" : "playoffs"}`}
                className="border border-b-0 border-landing-light bg-locker-surface lg:col-span-7 lg:row-start-1"
              >
                {leaders.map((entry) => (
                  <LeaderRow
                    key={entry.player.nbaPlayerId}
                    entry={entry}
                    isSelected={entry === selectedEntry}
                    onSelect={() => selectPlayer(entry.player.nbaPlayerId)}
                  />
                ))}
              </ol>
            </div>
          </SectionLoading>
        )}
      </div>

      {/* The page tutorial: opens by itself on this account's first visit,
          and the "?" button replays it. Not on the error screen above, which
          has none of the sections it points at. Kept outside every Reveal so
          its fixed overlay stays pinned to the viewport. */}
      <PageTutorial tutorial={ALL_TIME_LEADERS_TUTORIAL} />
    </div>
  );
}
