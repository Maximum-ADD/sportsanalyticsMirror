import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEloRatings, fetchGames } from "@/lib/nbaApi";
import { fetchLiveGames, type LiveGameSummary, type LiveGamesBoard } from "@/lib/liveGamesApi";
import {
  describeFinish,
  describeLiveState,
  LIVE_GAMES_QUERY_KEY,
  selectBoardRefreshInterval,
} from "@/lib/liveGameDisplay";
import { createEloRatingIndex, readEloRating, selectFeaturedGame } from "@/lib/featuredGame";
import { TeamBadge } from "@/components/TeamBadge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Game, TeamEloRating } from "@/types/nba";

// Shared with the Teams pages, which read the same ratings.
const ELO_RATINGS_QUERY_KEY = ["teamEloRatings"];
// Thirty teams play at most fifteen games on one day, so this many of the
// latest completed games always covers the latest game day in full.
const MOST_GAMES_ON_ONE_DAY = 15;
const STORED_GAMES_QUERY_PARAMS = { pageSize: MOST_GAMES_ON_ONE_DAY, status: "completed" as const };
// "2026-10-07T00:00:00.000Z" -> "2026-10-07": a stored game's calendar day.
const ISO_DATE_LENGTH = 10;
const STORED_GAME_FINISH_LABEL = "Final";

interface ScoreboardTeam {
  abbreviation: string;
  nbaTeamId: number;
  logoUrl?: string | null;
}

// One game as the banner draws it, whichever source it came from.
interface ScoreboardGame {
  homeTeam: ScoreboardTeam;
  awayTeam: ScoreboardTeam;
  homeScore: number;
  awayScore: number;
  isLive: boolean;
  /** "Q3 · 5:06" while live; "Final" or "Final/OT" once over. */
  statusLabel: string;
}

/** A game from the NBA's live feed, live or finished, as the banner draws it. */
function toScoreboardGameFromLiveFeed(game: LiveGameSummary): ScoreboardGame {
  const isLive = game.status === "live";
  return {
    homeTeam: { abbreviation: game.homeTeam.tricode, nbaTeamId: game.homeTeam.teamId },
    awayTeam: { abbreviation: game.awayTeam.tricode, nbaTeamId: game.awayTeam.teamId },
    homeScore: game.homeTeam.score,
    awayScore: game.awayTeam.score,
    isLive,
    statusLabel: isLive ? describeLiveState(game) : describeFinish(game.period, game.regulationPeriods),
  };
}

/** A completed game from the database as the banner draws it. */
function toScoreboardGameFromStoredGame(game: Game): ScoreboardGame {
  return {
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeScore: game.homeScore ?? 0,
    awayScore: game.awayScore ?? 0,
    isLive: false,
    statusLabel: STORED_GAME_FINISH_LABEL,
  };
}

/**
 * The biggest matchup on the live feed's board: among the games in progress
 * if any are, otherwise among those that finished in the last 18 hours.
 *
 * @returns null when the board has neither.
 */
function selectFeaturedLiveFeedGame(
  board: LiveGamesBoard,
  eloRatings: TeamEloRating[] | undefined
): LiveGameSummary | null {
  const eloRatingByNbaTeamId = createEloRatingIndex(eloRatings, (rating) => rating.team.nbaTeamId);
  const candidateGames = board.live.length > 0 ? board.live : board.recent;
  return selectFeaturedGame(candidateGames, (game) => ({
    homeTeamElo: readEloRating(eloRatingByNbaTeamId, game.homeTeam.teamId),
    awayTeamElo: readEloRating(eloRatingByNbaTeamId, game.awayTeam.teamId),
  }));
}

/**
 * The biggest matchup of the latest day with a completed game in the
 * database, for when the live feed has nothing (the off-season) or is down.
 *
 * @param latestGames - completed games, most recent first.
 */
function selectFeaturedStoredGame(latestGames: Game[], eloRatings: TeamEloRating[] | undefined): Game | null {
  const latestGameDay = latestGames[0]?.gameDate.slice(0, ISO_DATE_LENGTH);
  const latestDayGames = latestGames.filter((game) => game.gameDate.slice(0, ISO_DATE_LENGTH) === latestGameDay);
  const eloRatingByTeamId = createEloRatingIndex(eloRatings, (rating) => rating.team.id);
  return selectFeaturedGame(latestDayGames, (game) => ({
    homeTeamElo: readEloRating(eloRatingByTeamId, game.homeTeamId),
    awayTeamElo: readEloRating(eloRatingByTeamId, game.awayTeamId),
  }));
}

/**
 * Reads the game the scoreboard features. The live feed comes first: the
 * biggest live game, else the biggest one finished in the last 18 hours. Only
 * when the feed has neither, or can't be read, does it fall back to the
 * database's latest game day. "Biggest" is by the teams' current Elo ratings
 * (see selectFeaturedGame); if the ratings can't be read, every team counts
 * as equal and the feed's own order decides.
 */
function useFeaturedScoreboardGame(): { scoreboardGame: ScoreboardGame | null; isLoading: boolean } {
  const liveGamesQuery = useQuery({
    queryKey: LIVE_GAMES_QUERY_KEY,
    queryFn: fetchLiveGames,
    refetchInterval: (query) => selectBoardRefreshInterval(query.state.data),
  });
  const eloRatingsQuery = useQuery({ queryKey: ELO_RATINGS_QUERY_KEY, queryFn: fetchEloRatings });

  const board = liveGamesQuery.data;
  const eloRatings = eloRatingsQuery.data;
  const featuredLiveFeedGame = board ? selectFeaturedLiveFeedGame(board, eloRatings) : null;
  const needsStoredGames = board ? featuredLiveFeedGame === null : liveGamesQuery.isError;

  const storedGamesQuery = useQuery({
    queryKey: ["games", STORED_GAMES_QUERY_PARAMS],
    queryFn: () => fetchGames(STORED_GAMES_QUERY_PARAMS),
    enabled: needsStoredGames,
  });

  // isPending is false once a query has failed, so a failed read never holds
  // the banner on its placeholder.
  const isLoading = liveGamesQuery.isPending || eloRatingsQuery.isPending || (needsStoredGames && storedGamesQuery.isPending);
  if (isLoading) return { scoreboardGame: null, isLoading };

  if (featuredLiveFeedGame) return { scoreboardGame: toScoreboardGameFromLiveFeed(featuredLiveFeedGame), isLoading };
  const featuredStoredGame = selectFeaturedStoredGame(storedGamesQuery.data?.data ?? [], eloRatings);
  return { scoreboardGame: featuredStoredGame && toScoreboardGameFromStoredGame(featuredStoredGame), isLoading };
}

/** The live game's state, flagged in red so it can't be mistaken for a final score. */
function LiveStatusLabel({ statusLabel }: { statusLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[9px] text-white/80">
      <span className="inline-flex items-center gap-1 bg-locker-bad px-1 py-px text-white">
        <span className="size-1 rounded-full bg-white motion-safe:animate-pulse" />
        Live
      </span>
      <span className="tabular-nums">{statusLabel}</span>
    </span>
  );
}

export function LandingMatchWidget() {
  const captionId = useId();
  const { scoreboardGame: game, isLoading } = useFeaturedScoreboardGame();

  // h-10 sits inside the h-14 landing header row with an 8px margin above
  // and below, so it reads as part of the bar rather than a strip bleeding
  // out of it. The loading placeholder mirrors that same height, as a
  // faint white wash rather than a raised panel, so it blends the way the
  // resolved banner does and the row doesn't shift when the game lands.
  if (isLoading) {
    return <Skeleton className="h-10 w-56 bg-white/10 opacity-70" />;
  }

  if (!game) return null;

  const scoreSentence = `${game.homeTeam.abbreviation} ${game.homeScore}, ${game.awayTeam.abbreviation} ${game.awayScore}`;

  return (
    <div
      role="group"
      aria-labelledby={captionId}
      className="relative flex h-10 items-center gap-3"
    >
      <p id={captionId} className="sr-only">
        Match Updates
      </p>
      <p className="sr-only">
        {game.isLive
          ? `Live game: ${scoreSentence}, ${game.statusLabel}`
          : `Most recent result: ${scoreSentence}, ${game.statusLabel}`}
      </p>
      {/* Deliberately no panel: no background, border, or sheen, so the
          banner blends straight into the header's bg-landing-ink. All
          contrast comes from the white logo discs and the white mono
          score, and the hairline rule below is the only structure
          separating the two halves. */}
      {/* Logo VS logo, nothing drawn between them — with the panel gone,
          the orange center line read as a stray mark on the bar rather
          than a court cue. The badges render at size-8 (TeamBadge's
          className override wins over its md size-10 via tailwind-merge)
          so two of them fill most of the banner's height — the largest
          they can be while still clearing it with an even ring of
          background around each disc. */}
      <div aria-hidden className="relative flex items-center gap-1.5">
        <TeamBadge team={game.homeTeam} size="md" className="relative size-8 bg-white/90" />
        <span className="relative px-0.5 font-mono text-[9px] tracking-[0.1em] text-white uppercase">VS</span>
        <TeamBadge team={game.awayTeam} size="md" className="relative size-8 bg-white/90" />
      </div>
      {/* Hairline separating "who played" from "how it stands". With no
          panel around the banner this vertical rule is the only structure,
          so it sits a touch stronger than it needed to against the old
          box edge. The visible score is aria-hidden because the sr-only
          caption above already announces it — repeating it here would
          double every screen-reader visit. */}
      <div aria-hidden className="h-5 w-px bg-white/20" />
      <div
        aria-hidden
        className="flex items-baseline gap-1.5 font-mono text-xs whitespace-nowrap text-white uppercase"
      >
        <span>
          {game.homeTeam.abbreviation} <span className="tabular-nums">{game.homeScore}</span>
        </span>
        <span className="text-white/40">-</span>
        <span>
          <span className="tabular-nums">{game.awayScore}</span> {game.awayTeam.abbreviation}
        </span>
        {game.isLive ? (
          <LiveStatusLabel statusLabel={game.statusLabel} />
        ) : (
          <span className="text-[9px] text-white/50">{game.statusLabel}</span>
        )}
      </div>
    </div>
  );
}
