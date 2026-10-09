import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingMatchWidget } from "./LandingMatchWidget";
import { fetchEloRatings, fetchGames } from "@/lib/nbaApi";
import { fetchLiveGames, type LiveGameSummary, type LiveGamesBoard } from "@/lib/liveGamesApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Game, Team, TeamEloRating } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchGames: vi.fn(),
  fetchEloRatings: vi.fn(),
}));

vi.mock("@/lib/liveGamesApi", () => ({
  fetchLiveGames: vi.fn(),
}));

function buildTeam(id: string, nbaTeamId: number, abbreviation: string): Team {
  return { id, nbaTeamId, name: abbreviation, abbreviation, city: abbreviation, conference: "", division: "", logoUrl: null };
}

const LAKERS = buildTeam("team-lal", 1610612747, "LAL");
const KNICKS = buildTeam("team-nyk", 1610612752, "NYK");
const CELTICS = buildTeam("team-bos", 1610612738, "BOS");
const NUGGETS = buildTeam("team-den", 1610612743, "DEN");
const SPURS = buildTeam("team-sas", 1610612759, "SAS");
const THUNDER = buildTeam("team-okc", 1610612760, "OKC");

// Highest first, as the API returns them.
const ELO_RATINGS: TeamEloRating[] = [
  { team: THUNDER, elo: 1720 },
  { team: CELTICS, elo: 1650 },
  { team: NUGGETS, elo: 1600 },
  { team: KNICKS, elo: 1580 },
  { team: LAKERS, elo: 1520 },
  { team: SPURS, elo: 1450 },
].map((rating) => ({ ...rating, asOfGameId: "g", asOfGameDate: "2026-04-12T00:00:00.000Z" }));

function buildLiveGame(gameId: string, home: Team, away: Team, overrides: Partial<LiveGameSummary> = {}): LiveGameSummary {
  return {
    gameId,
    seasonType: "Preseason",
    status: "live",
    statusText: "Q3 5:06",
    period: 3,
    regulationPeriods: 4,
    gameClock: "PT05M06.00S",
    startsAt: "2026-10-09T00:00:00Z",
    endedAt: null,
    homeTeam: { teamId: home.nbaTeamId, tricode: home.abbreviation, city: home.city, name: home.name, score: 90 },
    awayTeam: { teamId: away.nbaTeamId, tricode: away.abbreviation, city: away.city, name: away.name, score: 94 },
    ...overrides,
  };
}

function buildFinishedGame(gameId: string, home: Team, away: Team): LiveGameSummary {
  return buildLiveGame(gameId, home, away, {
    status: "final",
    statusText: "Final",
    period: 4,
    gameClock: null,
    endedAt: "2026-10-09T02:30:00Z",
  });
}

function buildBoard(board: Partial<LiveGamesBoard>): LiveGamesBoard {
  return { live: [], upcoming: [], recent: [], ...board };
}

function buildStoredGame(id: string, gameDate: string, home: Team, away: Team): Game {
  return {
    id,
    nbaGameId: id,
    gameDate,
    season: "2025-26",
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeTeam: home,
    awayTeam: away,
    homeScore: 38,
    awayScore: 24,
    seasonType: "REGULAR",
    playoffRound: null,
  };
}

function storedGamesPage(games: Game[]) {
  return { data: games, page: 1, pageSize: 15, total: games.length };
}

const mockFetchGames = vi.mocked(fetchGames);
const mockFetchEloRatings = vi.mocked(fetchEloRatings);
const mockFetchLiveGames = vi.mocked(fetchLiveGames);

async function findBanner() {
  return screen.findByRole("group", { name: /match updates/i });
}

beforeEach(() => {
  mockFetchEloRatings.mockResolvedValue(ELO_RATINGS);
  mockFetchLiveGames.mockResolvedValue(buildBoard({}));
  mockFetchGames.mockResolvedValue(storedGamesPage([]));
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("LandingMatchWidget", () => {
  describe("with games live", () => {
    it("shows the live game whose teams have the highest combined Elo", async () => {
      mockFetchLiveGames.mockResolvedValue(
        buildBoard({
          live: [buildLiveGame("lal-nyk", LAKERS, KNICKS), buildLiveGame("bos-den", CELTICS, NUGGETS)],
          // A bigger matchup that has already finished doesn't outrank a live one.
          recent: [buildFinishedGame("okc-bos", THUNDER, CELTICS)],
        })
      );

      renderWithProviders(<LandingMatchWidget />);

      const banner = await findBanner();
      expect(banner).toHaveTextContent(/Live game: BOS 90, DEN 94, Q3 · 5:06/);
    });

    it("breaks a combined-Elo tie with the single highest-rated team", async () => {
      // OKC + SAS = 3170 and BOS + LAL = 3170; OKC is the best team in either.
      mockFetchLiveGames.mockResolvedValue(
        buildBoard({ live: [buildLiveGame("bos-lal", CELTICS, LAKERS), buildLiveGame("sas-okc", SPURS, THUNDER)] })
      );

      renderWithProviders(<LandingMatchWidget />);

      expect(await findBanner()).toHaveTextContent(/SAS 90, OKC 94/);
    });

    it("flags the score as live with the quarter and clock", async () => {
      mockFetchLiveGames.mockResolvedValue(buildBoard({ live: [buildLiveGame("lal-nyk", LAKERS, KNICKS)] }));

      renderWithProviders(<LandingMatchWidget />);

      const banner = await findBanner();
      expect(banner).toHaveTextContent("Live");
      expect(banner).toHaveTextContent("Q3 · 5:06");
      expect(banner).not.toHaveTextContent(/final/i);
      expect(mockFetchGames).not.toHaveBeenCalled();
    });

    it("still shows a live game when the Elo ratings can't be read", async () => {
      mockFetchEloRatings.mockRejectedValue(new Error("rate limited"));
      mockFetchLiveGames.mockResolvedValue(
        buildBoard({ live: [buildLiveGame("lal-nyk", LAKERS, KNICKS), buildLiveGame("bos-den", CELTICS, NUGGETS)] })
      );

      renderWithProviders(<LandingMatchWidget />);

      // Every team counts as equal, so the feed's order (earliest tip-off) decides.
      expect(await findBanner()).toHaveTextContent(/LAL 90, NYK 94/);
    });
  });

  describe("with nothing live", () => {
    it("shows the recently finished game with the highest combined Elo", async () => {
      mockFetchLiveGames.mockResolvedValue(
        buildBoard({ recent: [buildFinishedGame("lal-nyk", LAKERS, KNICKS), buildFinishedGame("okc-den", THUNDER, NUGGETS)] })
      );

      renderWithProviders(<LandingMatchWidget />);

      const banner = await findBanner();
      expect(banner).toHaveTextContent(/Most recent result: OKC 90, DEN 94, Final/);
      expect(screen.queryByText(/^live$/i)).not.toBeInTheDocument();
      expect(mockFetchGames).not.toHaveBeenCalled();
    });

    it("falls back to the biggest game of the latest stored game day when the feed has nothing", async () => {
      mockFetchGames.mockResolvedValue(
        storedGamesPage([
          buildStoredGame("g1", "2026-06-20T00:00:00.000Z", LAKERS, SPURS),
          buildStoredGame("g2", "2026-06-20T00:00:00.000Z", CELTICS, KNICKS),
          // A bigger matchup, but from an earlier day.
          buildStoredGame("g3", "2026-06-18T00:00:00.000Z", THUNDER, NUGGETS),
        ])
      );

      renderWithProviders(<LandingMatchWidget />);

      expect(await findBanner()).toHaveTextContent(/Most recent result: BOS 38, NYK 24, Final/);
      expect(mockFetchGames).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    });

    it("falls back to stored games when the live feed is down", async () => {
      mockFetchLiveGames.mockRejectedValue(new Error("503"));
      mockFetchGames.mockResolvedValue(storedGamesPage([buildStoredGame("g1", "2026-06-20T00:00:00.000Z", LAKERS, KNICKS)]));

      renderWithProviders(<LandingMatchWidget />);

      expect(await findBanner()).toHaveTextContent(/LAL 38, NYK 24/);
    });
  });

  it("fits inside the top bar as a compact single-row banner", async () => {
    mockFetchLiveGames.mockResolvedValue(buildBoard({ recent: [buildFinishedGame("lal-nyk", LAKERS, KNICKS)] }));

    renderWithProviders(<LandingMatchWidget />);

    // h-10 is the contract with LandingHeader's h-14 row — the banner must
    // sit inside the bar, not overhang it like the old h-36 card did.
    const banner = await findBanner();
    expect(banner).toHaveClass("h-10");
    expect(banner).toHaveTextContent("VS");
    // Blends into the bar: no panel background or border of its own.
    expect(banner).not.toHaveClass("bg-surface-nav");
    expect(banner).not.toHaveClass("border");
  });

  it("disappears rather than erroring when neither the feed nor the API is available", async () => {
    mockFetchLiveGames.mockRejectedValue(new Error("503"));
    mockFetchGames.mockRejectedValue(new Error("network down"));

    const { container } = renderWithProviders(<LandingMatchWidget />);

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });
});
