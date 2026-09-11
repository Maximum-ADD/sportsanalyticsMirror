import { useQueries, useQuery } from "@tanstack/react-query";
import { Award, ShieldCheck } from "lucide-react";
import { fetchGames, fetchGameDetail, fetchPlayerStatsBatch } from "@/lib/nbaApi";
import { computeReliability } from "@/lib/reliability";
import { TeamBadge } from "@/components/TeamBadge";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import type { PredictedScorer, Team } from "@/types/nba";

// Trading-card-style highlights, built entirely from data this app already
// predicts (predictedPoints, gamesConsidered) plus the same prediction-
// reliability computation GameDetailPage's player panel uses (lib/reliability)
// — no invented "confidence score," no new backend endpoint. One card type
// per real, distinct angle on a predicted scorer:
//   - Man of the match: highest predicted points.
//   - Consistency: highest prediction reliability (scores in a tight,
//     predictable band — the "safe" fantasy pick).
//   - Wildcard: a real boom/bust signal, not just "low reliability" — a
//     player with a genuinely high predicted-points ceiling (top half of
//     this set by predicted points) whose reliability is still low, i.e.
//     "could go big, could go bust," not just "the model doesn't know."

export interface ReliablePlayer {
  scorer: PredictedScorer;
  team: Team;
  reliability: ReturnType<typeof computeReliability> | null;
}

interface UsePlayerReliabilityOptions {
  scorers: PredictedScorer[];
  teamOf: (scorer: PredictedScorer) => Team;
}

// Fetches season stats (and so reliability) for every scorer passed in, in
// ONE request via GET /v1/players/stats-batch rather than one request per
// player — previously this fired N individual GET /v1/players/:id/stats
// calls in parallel (via useQueries), which for a ~15-30 player pool (see
// useUpcomingPlayerReliability below) meant that many round trips all
// competing for the same pooled Supabase connection before this section
// could render anything. See PlayersController.getPlayerStatsBatch.
export function usePlayerReliability({ scorers, teamOf }: UsePlayerReliabilityOptions): {
  players: ReliablePlayer[];
  isPending: boolean;
} {
  const playerIds = scorers.map((scorer) => scorer.player.id);
  // Stable, order-independent key: two renders with the same scorer set in
  // a different order should hit the same cache entry rather than refetch.
  const queryKey = ["playerStatsBatch", playerIds.slice().sort().join(",")];

  const statsQuery = useQuery({
    queryKey,
    queryFn: () => fetchPlayerStatsBatch(playerIds),
    enabled: playerIds.length > 0,
  });

  const statsByPlayerId = new Map((statsQuery.data?.players ?? []).map((entry) => [entry.playerId, entry]));

  const players = scorers.map((scorer) => {
    const stats = statsByPlayerId.get(scorer.player.id);
    return {
      scorer,
      team: teamOf(scorer),
      reliability: stats ? computeReliability(stats.gameLog, scorer.predictedPoints) : null,
    };
  });

  return { players, isPending: playerIds.length > 0 && statsQuery.isPending };
}

type CardKind = "match" | "consistency";

const CARD_STYLES: Record<CardKind, { label: string; accent: string; icon: typeof Award }> = {
  match: { label: "Man of the match", accent: "var(--color-locker-leather)", icon: Award },
  consistency: { label: "Consistency pick", accent: "var(--color-locker-model)", icon: ShieldCheck },
};

interface PlayerTradingCardProps {
  kind: CardKind;
  entry: ReliablePlayer;
}

function PlayerTradingCard({ kind, entry }: PlayerTradingCardProps) {
  const { label, accent, icon: Icon } = CARD_STYLES[kind];
  const { scorer, team, reliability } = entry;

  return (
    <div className="flex flex-col border bg-locker-surface" style={{ borderColor: accent, borderWidth: 2 }}>
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[9px] tracking-[0.14em] text-white uppercase"
        style={{ backgroundColor: accent }}
      >
        <Icon aria-hidden className="size-3" />
        {label}
      </div>
      <div className="flex flex-col items-center p-4 text-center">
        <PlayerHeadshot player={scorer.player} size="lg" className="size-20" />
        <p className="mt-3 font-display text-base tracking-[0.01em] text-landing-ink uppercase">
          {scorer.player.firstName} {scorer.player.lastName}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-locker-ink-muted">
          <TeamBadge team={team} size="sm" className="size-4" />
          {team.abbreviation} · {scorer.player.position}
        </div>

        <div className="mt-3 grid w-full grid-cols-2 gap-2">
          <div className="border border-landing-light bg-landing-hero px-2 py-2">
            <div className="font-mono text-[8px] tracking-[0.08em] text-locker-ink-muted uppercase">Pred pts</div>
            <div className="mt-0.5 font-display text-lg text-landing-ink tabular-nums">{scorer.predictedPoints}</div>
          </div>
          <div className="border border-landing-light bg-landing-hero px-2 py-2">
            <div className="font-mono text-[8px] tracking-[0.08em] text-locker-ink-muted uppercase">Reliability</div>
            <div
              className="mt-0.5 font-display text-lg tabular-nums"
              style={{ color: reliability ? accent : "var(--color-text-secondary)" }}
            >
              {reliability ? `${reliability.closeGames}/${reliability.totalGames}` : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface HighlightCard {
  kind: CardKind;
  entry: ReliablePlayer;
}

// Picks cards from `players`, one per card type first (Match, then
// Consistency — two real, distinct angles, see module docstring), then —
// only if `count` asks for more than 2 — fills any remaining slots with
// runner-up CONSISTENCY picks (next-highest reliability rate, not
// duplicate "man of the match" picks — a second-highest scorer isn't a
// second distinct fact the way a second-most-reliable player is). Never
// forces a weak pick just to hit `count`: a category with nothing that
// genuinely qualifies (e.g. no one with reliability data yet) is simply
// omitted, and running out of distinct players ends the list early rather
// than padding it with duplicates.
export function pickHighlightCards(players: ReliablePlayer[], count = 2): HighlightCard[] {
  if (players.length === 0) return [];

  const withReliability = players.filter((entry) => entry.reliability !== null && entry.reliability.totalGames > 0);
  const byPointsDesc = players.slice().sort((a, b) => b.scorer.predictedPoints - a.scorer.predictedPoints);
  const byReliabilityDesc = withReliability.slice().sort((a, b) => b.reliability!.rate - a.reliability!.rate);

  const manOfTheMatch = byPointsDesc[0];
  const consistency = byReliabilityDesc[0];

  const used = new Set<string>();
  const cards: HighlightCard[] = [];
  for (const [kind, entry] of [
    ["match", manOfTheMatch],
    ["consistency", consistency],
  ] as [CardKind, ReliablePlayer | undefined][]) {
    if (!entry || used.has(entry.scorer.player.id)) continue;
    used.add(entry.scorer.player.id);
    cards.push({ kind, entry });
  }

  for (const entry of byReliabilityDesc) {
    if (cards.length >= count) break;
    if (used.has(entry.scorer.player.id)) continue;
    used.add(entry.scorer.player.id);
    cards.push({ kind: "consistency", entry });
  }

  return cards.slice(0, count);
}

interface PlayerCardsDisplayProps {
  title: string;
  description: string;
  players: ReliablePlayer[];
  isPending: boolean;
  count?: number;
}

// Grid columns scale with how many cards actually rendered, not a fixed
// 3-up layout left over from the old three-card-type scheme — 2 cards
// (the common case: one Match, one Consistency) reads best as two wide
// tiles, not two tiles stranded in a 3-wide grid with an empty slot.
function gridColumnsClass(cardCount: number): string {
  if (cardCount <= 2) return "sm:grid-cols-2";
  if (cardCount <= 4) return "sm:grid-cols-2 lg:grid-cols-4";
  return "sm:grid-cols-3 lg:grid-cols-5";
}

// Presentational half — takes already-resolved players/reliability rather
// than fetching its own, so a caller that already needed the same
// reliability data for something else (GameDetailPage's Fantasy watch
// "Reliable" tag) can compute it once and hand it to both rather than
// firing the same batch stats request twice.
export function PlayerCardsDisplay({ title, description, players, isPending, count = 2 }: PlayerCardsDisplayProps) {
  const cards = pickHighlightCards(players, count);

  if (players.length === 0) return null;

  return (
    <section className="border border-landing-light bg-locker-surface p-5">
      <div className="mb-1 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          {title}
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
      </div>
      <p className="mb-4 text-[11px] leading-relaxed text-locker-ink-muted">{description}</p>

      {isPending && cards.length === 0 ? (
        <div className="flex justify-center py-8">
          <BasketballSpinner size="sm" label="Sizing up the matchup" />
        </div>
      ) : cards.length === 0 ? (
        <p className="border border-dashed border-landing-light bg-landing-hero p-5 text-center text-[12.5px] text-locker-ink-muted">
          Not enough data yet to call out a standout pick here.
        </p>
      ) : (
        <div className={`grid grid-cols-1 gap-3.5 ${gridColumnsClass(cards.length)}`}>
          {cards.map(({ kind, entry }, index) => (
            <PlayerTradingCard key={`${kind}-${entry.scorer.player.id}-${index}`} kind={kind} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}

interface PlayerCardsSectionProps {
  title: string;
  description: string;
  scorers: PredictedScorer[];
  teamOf: (scorer: PredictedScorer) => Team;
  count?: number;
}

// Self-fetching convenience wrapper around PlayerCardsDisplay for a caller
// that doesn't already have reliability data computed for this scorer pool
// from somewhere else.
export function PlayerCardsSection({ title, description, scorers, teamOf, count = 2 }: PlayerCardsSectionProps) {
  const { players, isPending } = usePlayerReliability({ scorers, teamOf });
  return (
    <PlayerCardsDisplay title={title} description={description} players={players} isPending={isPending} count={count} />
  );
}

// How many of the soonest upcoming games to pull predicted scorers from for
// a cross-game "best of the app" pool — enough games to have a real pool of
// players to pick several genuinely distinct cards from, small enough to
// keep the fan-out (one GET /v1/games/:id per game, each already including
// predictedScorers — see GameDetailService) to a handful of requests rather
// than dozens. The per-player stats fan-out this used to also cause is
// gone (see usePlayerReliability's own doc comment) — this constant is the
// one still-real cost, since GameDetailService's roster/history join is
// the heaviest query in the app and there's no batch version of it yet.
const UPCOMING_GAMES_FOR_CARDS = 4;

// Cross-game version of usePlayerReliability: fetches the soonest N
// upcoming games directly (?status=upcoming — NOT the unscoped GET
// /v1/games this used to call and then filter client-side, which only
// happened to work because of the same upcoming-first ordering this now
// asks for explicitly), then each one's predicted scorers, then reliability
// for the pooled result via the same one-request batch stats call
// usePlayerReliability uses. A game with no prediction yet or no
// predictable scorers simply contributes nothing to the pool rather than
// erroring the whole section.
export function useUpcomingPlayerReliability(): { players: ReliablePlayer[]; isPending: boolean } {
  const gamesQuery = useQuery({
    queryKey: ["games", { pageSize: UPCOMING_GAMES_FOR_CARDS, status: "upcoming" as const }],
    queryFn: () => fetchGames({ pageSize: UPCOMING_GAMES_FOR_CARDS, status: "upcoming" }),
  });

  const upcomingGames = gamesQuery.data?.data ?? [];

  const detailQueries = useQueries({
    queries: upcomingGames.map((game) => ({
      queryKey: ["gameDetail", game.id],
      queryFn: () => fetchGameDetail(game.id),
    })),
  });

  const scorersWithTeam = detailQueries.flatMap((query) => {
    if (!query.data) return [];
    const { homeTeam, awayTeam, homeTeamId } = query.data;
    return query.data.predictedScorers.map((scorer) => ({
      scorer,
      team: scorer.player.teamId === homeTeamId ? homeTeam : awayTeam,
    }));
  });

  const reliability = usePlayerReliability({
    scorers: scorersWithTeam.map(({ scorer }) => scorer),
    teamOf: (scorer) => scorersWithTeam.find((entry) => entry.scorer === scorer)!.team,
  });

  const isPending = gamesQuery.isPending || detailQueries.some((query) => query.isPending) || reliability.isPending;

  return { players: reliability.players, isPending };
}
