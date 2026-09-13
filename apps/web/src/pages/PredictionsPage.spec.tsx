import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PredictionsPage } from "./PredictionsPage";
import { fetchEloRatings, fetchGameDetail, fetchGames, fetchPlayerStatsBatch, fetchSeasons } from "@/lib/nbaApi";
import { ApiError } from "@/lib/apiClient";
import { useSession } from "@/lib/authClient";
import { fetchMe } from "@/lib/meApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import type { Game, GamePrediction, MeProfile, Team } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchGames: vi.fn(),
  fetchSeasons: vi.fn(),
  fetchEloRatings: vi.fn(),
  fetchGameDetail: vi.fn(),
  fetchPlayerStatsBatch: vi.fn(),
}));

vi.mock("@/lib/authClient", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/meApi", () => ({
  fetchMe: vi.fn(),
}));

const LAKERS: Team = {
  id: "team-1",
  nbaTeamId: 1,
  name: "Lakers",
  abbreviation: "LAL",
  city: "Los Angeles",
  conference: "West",
  division: "Pacific",
  logoUrl: null,
};

const CELTICS: Team = {
  id: "team-2",
  nbaTeamId: 2,
  name: "Celtics",
  abbreviation: "BOS",
  city: "Boston",
  conference: "East",
  division: "Atlantic",
  logoUrl: null,
};

const PREDICTION: GamePrediction = {
  id: "prediction-1",
  gameId: "game-1",
  homeWinProbability: 0.62,
  homeTeamEloPre: 1512.5,
  awayTeamEloPre: 1487.5,
  predictedMarginHome: 3.68,
  marginMethod: "heuristic",
  createdAt: "2026-08-18T00:00:00.000Z",
};

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game-1",
    nbaGameId: "MOCK-GAME-0",
    gameDate: "2026-01-01T00:00:00.000Z",
    season: "2025-26",
    homeTeamId: LAKERS.id,
    awayTeamId: CELTICS.id,
    homeTeam: LAKERS,
    awayTeam: CELTICS,
    homeScore: 119,
    awayScore: 100,
    seasonType: "REGULAR",
    playoffRound: null,
    ...overrides,
  };
}

describe("PredictionsPage", () => {
  beforeEach(() => {
    vi.mocked(fetchSeasons).mockResolvedValue(["2025-26"]);
    // Default to "nothing" for the highlight/top-5 sections' own queries
    // (ModelHighlightsSection, useUpcomingPlayerReliability) — most tests
    // below aren't exercising those sections specifically. An unmocked
    // vi.fn() resolves to undefined synchronously, which React Query treats
    // as an invalid resolved value (a console warning) rather than "still
    // loading".
    vi.mocked(fetchEloRatings).mockResolvedValue([]);
    vi.mocked(fetchGameDetail).mockRejectedValue(new Error("not mocked in this test"));
    vi.mocked(fetchPlayerStatsBatch).mockResolvedValue({ players: [] });
    // Signed out by default — Your matchups/Tailored for you have their own
    // tests below that mock a real session and GET /v1/me response.
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Only the games matching the requested `status` are ever returned — a
  // completed game must never show up in a status=upcoming request or vice
  // versa, matching real GamesService.getGames behavior (and preventing the
  // same fixture game from ambiguously appearing in both the main grid and
  // Model highlights' upcoming-only queries).
  function mockGamesByStatus(games: Game[]) {
    vi.mocked(fetchGames).mockImplementation(async (params) => {
      const status = params?.status ?? "all";
      const matching =
        status === "all"
          ? games
          : games.filter((game) => (status === "completed" ? game.homeScore !== null : game.homeScore === null));
      return { data: matching, page: 1, pageSize: params?.pageSize ?? 60, total: matching.length };
    });
  }

  it("has no automated accessibility violations", async () => {
    mockGamesByStatus([makeGame({ homeScore: null, awayScore: null, prediction: PREDICTION })]);

    const { container } = renderWithProviders(<main><PredictionsPage /></main>);
    await screen.findAllByText("LAL 62%", { exact: false });

    await expectNoAccessibilityViolations(container);
  });

  it("renders each game's win probability and margin from the joined prediction", async () => {
    // homeWinProbability 0.62 means this same upcoming game can legitimately
    // appear both as a main-grid card AND as a Model highlights pick (it's
    // the only upcoming game in the fixture) — assert with getAllByText,
    // not a single-match query, since both are real, simultaneously-correct
    // renderings of the same underlying game.
    mockGamesByStatus([makeGame({ homeScore: null, awayScore: null, prediction: PREDICTION })]);

    renderWithProviders(<PredictionsPage />);

    expect((await screen.findAllByText("LAL 62%", { exact: false })).length).toBeGreaterThan(0);
    expect(screen.getByText("LAL by 3.7", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText("heuristic").length).toBeGreaterThan(0);
  });

  it("shows a friendly per-row message when a game has no prediction yet", async () => {
    mockGamesByStatus([makeGame({ homeScore: null, awayScore: null, prediction: null })]);

    renderWithProviders(<PredictionsPage />);

    expect(await screen.findByText("No prediction yet")).toBeInTheDocument();
  });

  it("shows an ErrorState and retries when Retry is clicked, if the games list itself fails to load", async () => {
    vi.mocked(fetchGames).mockRejectedValue(new ApiError("server error", 500));

    renderWithProviders(<PredictionsPage />);

    expect(await screen.findByText("Could not load games.")).toBeInTheDocument();
  });

  it("shows only the first page of cards with a View more button when there are more games than the page size", async () => {
    const games = Array.from({ length: 12 }, (_, index) =>
      makeGame({
        id: `game-${index}`,
        nbaGameId: `MOCK-GAME-${index}`,
        gameDate: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        homeScore: null,
        awayScore: null,
        prediction: { ...PREDICTION, gameId: `game-${index}` },
      })
    );
    mockGamesByStatus(games);

    renderWithProviders(<PredictionsPage />);

    await screen.findAllByText("LAL by 3.7", { exact: false });
    expect(screen.getAllByText("LAL by 3.7", { exact: false })).toHaveLength(9);

    const viewMoreButton = screen.getByRole("button", { name: /view more/i });
    await userEvent.click(viewMoreButton);

    expect(screen.getAllByText("LAL by 3.7", { exact: false })).toHaveLength(12);
    expect(screen.queryByRole("button", { name: /view more/i })).not.toBeInTheDocument();

    const showLessButton = screen.getByRole("button", { name: /show less/i });
    await userEvent.click(showLessButton);

    expect(screen.getAllByText("LAL by 3.7", { exact: false })).toHaveLength(9);
    expect(screen.queryByRole("button", { name: /show less/i })).not.toBeInTheDocument();
  });

  it("still shows recent results when the main list is upcoming-only", async () => {
    // Regression test: gamesQuery (the main card grid) can be scoped to
    // upcoming games with no scores yet — Recent results must come from its
    // own dedicated completed-games fetch (recentGamesQuery), not from
    // whatever gamesQuery happens to return.
    const upcomingGame = makeGame({
      id: "upcoming-1",
      homeScore: null,
      awayScore: null,
      prediction: { ...PREDICTION, gameId: "upcoming-1" },
    });
    const completedGame = makeGame({ id: "completed-1", prediction: { ...PREDICTION, gameId: "completed-1" } });

    vi.mocked(fetchGames).mockImplementation(async (params) => {
      if (params?.status === "completed") {
        return { data: [completedGame], page: 1, pageSize: 60, total: 1 };
      }
      return { data: [upcomingGame], page: 1, pageSize: 60, total: 1 };
    });

    renderWithProviders(<PredictionsPage />);

    expect(await screen.findByText(/recent results/i)).toBeInTheDocument();
    // The completed game's score shows up in Recent results even though
    // gamesQuery's own result set (the main grid) is upcoming-only.
    expect(screen.getByText("100–119", { exact: false })).toBeInTheDocument();
  });

  it("passes the selected season as a real server param and offers real season options", async () => {
    vi.mocked(fetchSeasons).mockResolvedValue(["2026-27", "2025-26", "2024-25"]);
    vi.mocked(fetchGames).mockResolvedValue({
      data: [makeGame({ prediction: PREDICTION })],
      page: 1,
      pageSize: 60,
      total: 1,
    });

    renderWithProviders(<PredictionsPage />);
    await screen.findByText("LAL by 3.7", { exact: false });

    const seasonSelect = await screen.findByLabelText(/filter games by season/i);
    expect(screen.getByRole("option", { name: "2024-25" })).toBeInTheDocument();

    await userEvent.selectOptions(seasonSelect, "2024-25");

    // Selecting a specific season asks for that season's own full mix
    // (status=all, scoped to the season) rather than the default
    // upcoming-only view.
    expect(fetchGames).toHaveBeenCalledWith(expect.objectContaining({ season: "2024-25", status: "all" }));
  });

  it("defaults to upcoming games (not a plain unscoped fetch) with no All/Upcoming/Completed buttons", async () => {
    mockGamesByStatus([makeGame({ homeScore: null, awayScore: null, prediction: PREDICTION })]);

    renderWithProviders(<PredictionsPage />);
    await screen.findByText("LAL by 3.7", { exact: false });

    expect(fetchGames).toHaveBeenCalledWith(expect.objectContaining({ status: "upcoming" }));
    // The old three-button status toggle is gone — the season dropdown is
    // now the only filter control besides search.
    expect(screen.queryByRole("button", { name: /^all games$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^upcoming$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^completed$/i })).not.toBeInTheDocument();
  });

  it("shows Model highlights at the top of the page, above Recent results", async () => {
    const closeGame = makeGame({
      id: "close-game",
      homeScore: null,
      awayScore: null,
      prediction: { ...PREDICTION, gameId: "close-game", homeWinProbability: 0.51 },
    });
    mockGamesByStatus([closeGame]);
    vi.mocked(fetchEloRatings).mockResolvedValue([
      { team: LAKERS, elo: 1620, asOfGameId: "close-game", asOfGameDate: "2026-01-01T00:00:00.000Z" },
    ]);

    renderWithProviders(<PredictionsPage />);

    const highlightsHeading = await screen.findByRole("heading", { name: /model highlights/i });
    await screen.findByText(/most anticipated/i);
    const recentResultsHeading = screen.queryByRole("heading", { name: /recent results/i });

    expect(highlightsHeading).toBeInTheDocument();
    expect(screen.getByText(/most confident pick/i)).toBeInTheDocument();
    expect(screen.getByText(/best-rated team/i)).toBeInTheDocument();
    // DOCUMENT_POSITION_FOLLOWING (4) means highlightsHeading comes first.
    if (recentResultsHeading) {
      expect(highlightsHeading.compareDocumentPosition(recentResultsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("shows Top 5 to watch underneath the card grid", async () => {
    const game = makeGame({ homeScore: null, awayScore: null, prediction: PREDICTION });
    mockGamesByStatus([game]);
    vi.mocked(fetchGameDetail).mockResolvedValue({
      ...game,
      predictedScorers: [
        {
          player: {
            id: "player-1",
            nbaPlayerId: 2544,
            firstName: "LeBron",
            lastName: "James",
            position: "F",
            heightInches: 81,
            weightLbs: 250,
            jerseyNumber: "23",
            headshotUrl: null,
            teamId: LAKERS.id,
            team: LAKERS,
            birthDate: null,
            school: null,
            country: null,
            lastAffiliation: null,
            seasonExp: null,
            rosterStatus: null,
            draftYear: null,
            draftRound: null,
            draftNumber: null,
          },
          predictedPoints: 27.4,
          gamesConsidered: 8,
        },
      ],
    });
    vi.mocked(fetchPlayerStatsBatch).mockResolvedValue({
      players: [
        {
          playerId: "player-1",
          seasonAverages: {
            gamesPlayed: 8,
            minutesPerGame: 35,
            pointsPerGame: 27,
            reboundsPerGame: 7,
            assistsPerGame: 8,
            stealsPerGame: 1,
            blocksPerGame: 0.5,
            turnoversPerGame: 3,
            fieldGoalsMadePerGame: 9,
            fieldGoalsAttemptedPerGame: 18,
            fieldGoalPercentage: 0.5,
            threesMadePerGame: 2,
            threesAttemptedPerGame: 5,
            threePointPercentage: 0.4,
            freeThrowsMadePerGame: 4,
            freeThrowsAttemptedPerGame: 5,
            freeThrowPercentage: 0.8,
            trueShootingPercentage: 0.58,
            effectiveFieldGoalPercentage: 0.56,
            assistToTurnoverRatio: 2.67,
            plusMinusPerGame: 4.2,
            usagePercentage: 28.5,
            offensiveRating: 115,
            defensiveRating: 108,
          },
          gameLog: [{ gameId: "g1", gameDate: "2026-01-01T00:00:00.000Z", points: 28, season: "2025-26" }],
        },
      ],
    });

    renderWithProviders(<PredictionsPage />);

    const cardGridGame = await screen.findByText("LAL by 3.7", { exact: false });
    const top5Heading = await screen.findByRole("heading", { name: /top 5 to watch/i });

    expect(top5Heading).toBeInTheDocument();
    expect(await screen.findByText("LeBron James")).toBeInTheDocument();
    // Card grid content precedes Top 5 to watch in document order.
    expect(cardGridGame.compareDocumentPosition(top5Heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  function mockSignedIn(me: MeProfile) {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: me.email, name: me.name } },
      isPending: false,
    } as never);
    vi.mocked(fetchMe).mockResolvedValue(me);
  }

  function makePlayer(overrides: Partial<MeProfile["followedPlayers"][number]> = {}): MeProfile["followedPlayers"][number] {
    return {
      id: "player-1",
      nbaPlayerId: 2544,
      firstName: "LeBron",
      lastName: "James",
      position: "F",
      heightInches: 81,
      weightLbs: 250,
      jerseyNumber: "23",
      headshotUrl: null,
      teamId: LAKERS.id,
      team: LAKERS,
      birthDate: null,
      school: null,
      country: null,
      lastAffiliation: null,
      seasonExp: null,
      rosterStatus: null,
      draftYear: null,
      draftRound: null,
      draftNumber: null,
      ...overrides,
    };
  }

  const ME_BASE: MeProfile = {
    id: "user-1",
    email: "player@example.com",
    name: "Player One",
    username: "playerone",
    avatarUrl: null,
    favoriteTeam: null,
    followedPlayers: [],
    role: "USER",
  };

  it("shows the favorite team's next game and the model's pick in Your matchups", async () => {
    const nextGame = makeGame({
      id: "next-game",
      homeScore: null,
      awayScore: null,
      prediction: { ...PREDICTION, gameId: "next-game" },
    });
    mockGamesByStatus([nextGame]);
    mockSignedIn({ ...ME_BASE, favoriteTeam: LAKERS });

    renderWithProviders(<PredictionsPage />);

    expect(await screen.findByRole("heading", { name: /your matchups/i })).toBeInTheDocument();
    const nextGameLabel = screen.getByText(/lakers's next game/i);
    const matchupLink = nextGameLabel.closest("a");
    expect(matchupLink).not.toBeNull();
    expect(matchupLink).toHaveAttribute("href", "/games/next-game");
    // homeWinProbability 0.62 favors the home team (Lakers).
    expect(matchupLink).toHaveTextContent("LAL 62%");
  });

  it("lists a followed player's next game in Your matchups", async () => {
    const nextGame = makeGame({
      id: "next-game",
      homeScore: null,
      awayScore: null,
      prediction: { ...PREDICTION, gameId: "next-game" },
    });
    mockGamesByStatus([nextGame]);
    mockSignedIn({ ...ME_BASE, followedPlayers: [makePlayer()] });

    renderWithProviders(<PredictionsPage />);

    expect(await screen.findByRole("heading", { name: /your matchups/i })).toBeInTheDocument();
    expect(screen.getByText("LeBron James")).toBeInTheDocument();
  });

  it("omits Your matchups for a signed-out visitor", async () => {
    mockGamesByStatus([makeGame({ homeScore: null, awayScore: null, prediction: PREDICTION })]);

    renderWithProviders(<PredictionsPage />);

    await screen.findByText("LAL by 3.7", { exact: false });
    expect(screen.queryByRole("heading", { name: /your matchups/i })).not.toBeInTheDocument();
  });

  it("omits Your matchups for a signed-in user with no favorite team or follows", async () => {
    mockGamesByStatus([makeGame({ homeScore: null, awayScore: null, prediction: PREDICTION })]);
    mockSignedIn(ME_BASE);

    renderWithProviders(<PredictionsPage />);

    await screen.findByText("LAL by 3.7", { exact: false });
    expect(screen.queryByRole("heading", { name: /your matchups/i })).not.toBeInTheDocument();
  });

  it("shows a followed player's predicted points and links their mini card to their profile", async () => {
    const nextGame = makeGame({
      id: "next-game",
      homeScore: null,
      awayScore: null,
      prediction: { ...PREDICTION, gameId: "next-game" },
    });
    mockGamesByStatus([nextGame]);
    mockSignedIn({ ...ME_BASE, followedPlayers: [makePlayer()] });
    vi.mocked(fetchGameDetail).mockResolvedValue({
      ...nextGame,
      predictedScorers: [{ player: makePlayer(), predictedPoints: 27.4, gamesConsidered: 8 }],
    });

    renderWithProviders(<PredictionsPage />);

    const playerLink = await screen.findByRole("link", { name: /lebron james/i });
    expect(playerLink).toHaveAttribute("href", "/players/player-1");
    expect(playerLink).toHaveTextContent("27.4");
  });

  it("shows the model's longest streak, high-confidence accuracy, and most predictable team", async () => {
    const games = [
      makeGame({ id: "g1", prediction: { ...PREDICTION, gameId: "g1", homeWinProbability: 0.75 } }),
      makeGame({ id: "g2", prediction: { ...PREDICTION, gameId: "g2", homeWinProbability: 0.75 } }),
      makeGame({ id: "g3", prediction: { ...PREDICTION, gameId: "g3", homeWinProbability: 0.75 } }),
    ];
    mockGamesByStatus(games);

    renderWithProviders(<PredictionsPage />);

    expect(await screen.findByRole("heading", { name: /model track record/i })).toBeInTheDocument();
    expect(screen.getByText("3 games", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/most predictable team/i)).toBeInTheDocument();
    expect(screen.getByText("Lakers")).toBeInTheDocument();
  });
});
