import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEloRatings, fetchPlayers, fetchTeam, fetchTeamRecords } from "@/lib/nbaApi";
import { useSession } from "@/lib/authClient";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Player, Team } from "@/types/nba";
import { TeamProfilePage } from "./TeamProfilePage";

vi.mock("@/lib/nbaApi", () => ({
  fetchTeam: vi.fn(),
  fetchPlayers: vi.fn(),
  fetchEloRatings: vi.fn(),
  fetchTeamRecords: vi.fn(),
}));

vi.mock("@/lib/authClient", () => ({
  useSession: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useParams: () => ({ teamId: "team-1" }) };
});

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

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    nbaPlayerId: 1,
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

describe("TeamProfilePage", () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);
    vi.mocked(fetchEloRatings).mockResolvedValue([]);
    vi.mocked(fetchTeamRecords).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the team header and roster once the queries resolve", async () => {
    vi.mocked(fetchTeam).mockResolvedValue(LAKERS);
    vi.mocked(fetchPlayers).mockResolvedValue({ data: [makePlayer()], page: 1, pageSize: 25, total: 1 });

    renderWithProviders(<TeamProfilePage />, ["/teams/team-1"]);

    expect(await screen.findByText("Los Angeles Lakers")).toBeInTheDocument();
    expect(screen.getByText("LeBron James")).toBeInTheDocument();
  });

  it("renders a Back button above the profile", async () => {
    vi.mocked(fetchTeam).mockResolvedValue(LAKERS);
    vi.mocked(fetchPlayers).mockResolvedValue({ data: [], page: 1, pageSize: 25, total: 0 });

    renderWithProviders(<TeamProfilePage />, ["/teams/team-1"]);

    expect(await screen.findByRole("button", { name: /Back/ })).toBeInTheDocument();
  });

  it("shows the team's Elo rating and record", async () => {
    vi.mocked(fetchTeam).mockResolvedValue(LAKERS);
    vi.mocked(fetchPlayers).mockResolvedValue({ data: [], page: 1, pageSize: 25, total: 0 });
    vi.mocked(fetchEloRatings).mockResolvedValue([
      { team: LAKERS, elo: 1521, asOfGameId: "g1", asOfGameDate: "2026-01-01" },
    ]);
    vi.mocked(fetchTeamRecords).mockResolvedValue([
      { teamId: LAKERS.id, wins: 41, losses: 27, winPercentage: 0.603, recentForm: ["L", "W", "W", "L", "W"] },
    ]);

    renderWithProviders(<TeamProfilePage />, ["/teams/team-1"]);

    expect(await screen.findByText("1521")).toBeInTheDocument();
    expect(screen.getByText("41–27")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("shows a message when the roster is empty", async () => {
    vi.mocked(fetchTeam).mockResolvedValue(LAKERS);
    vi.mocked(fetchPlayers).mockResolvedValue({ data: [], page: 1, pageSize: 25, total: 0 });

    renderWithProviders(<TeamProfilePage />, ["/teams/team-1"]);

    expect(await screen.findByText("No roster players found.")).toBeInTheDocument();
  });
});
