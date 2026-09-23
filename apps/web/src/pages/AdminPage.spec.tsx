import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "./AdminPage";
import { useSession } from "@/lib/authClient";
import { fetchMe } from "@/lib/meApi";
import {
  fetchAdminPlayers,
  fetchAdminTeams,
  fetchAdminUsers,
  updateAdminPlayer,
  updateAdminTeam,
  updateAdminUserRole,
  deleteAdminUser,
  fetchAdminBatches,
  triggerIngestionPull,
  fetchIngestionRequests,
  approveAdminBatch,
  rejectAdminBatch,
  fetchAdminCorrections,
  fetchAdminConsumers,
  createAdminConsumer,
  createAdminApiKey,
  revokeAdminApiKey,
  deleteAdminConsumer,
  deleteAdminApiKey,
  fetchIngestionSchedule,
  fetchAdminGames,
  fetchAdminPlayByPlay,
  previewEventCorrection,
  correctGameEvent,
  revertEventCorrection,
  replayAdminGame,
  type AdminGamePlayByPlay,
  type EventCorrection,
  type IngestionScheduleConfig,
} from "@/lib/adminApi";
import { ApiError } from "@/lib/apiClient";
import { fetchSeasons, fetchTeams } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { AdminUserSummary, MeProfile, Player, Team } from "@/types/nba";

vi.mock("@/lib/authClient", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/meApi", () => ({
  fetchMe: vi.fn(),
}));

vi.mock("@/lib/adminApi", () => ({
  fetchAdminTeams: vi.fn(),
  updateAdminTeam: vi.fn(),
  fetchAdminPlayers: vi.fn(),
  updateAdminPlayer: vi.fn(),
  fetchAdminUsers: vi.fn(),
  updateAdminUserRole: vi.fn(),
  deleteAdminUser: vi.fn(),
  fetchAdminBatches: vi.fn(),
  approveAdminBatch: vi.fn(),
  rejectAdminBatch: vi.fn(),
  fetchAdminCorrections: vi.fn(),
  fetchAdminConsumers: vi.fn(),
  createAdminConsumer: vi.fn(),
  createAdminApiKey: vi.fn(),
  revokeAdminApiKey: vi.fn(),
  deleteAdminConsumer: vi.fn(),
  deleteAdminApiKey: vi.fn(),
  fetchIngestionSchedule: vi.fn(),
  updateIngestionSchedule: vi.fn(),
  triggerIngestionPull: vi.fn(),
  deleteIngestionBatch: vi.fn(),
  fetchIngestionRequests: vi.fn(),
  cancelIngestionRequest: vi.fn(),
  fetchAdminGames: vi.fn(),
  fetchAdminPlayByPlay: vi.fn(),
  previewEventCorrection: vi.fn(),
  correctGameEvent: vi.fn(),
  revertEventCorrection: vi.fn(),
  replayAdminGame: vi.fn(),
}));

vi.mock("@/lib/nbaApi", () => ({
  fetchTeams: vi.fn(),
  fetchSeasons: vi.fn(),
}));

/** A schedule as a server that runs pulls itself reports it; override
 * fields to describe other states (e.g. pullMode "queue"). */
function makeSchedule(overrides: Partial<IngestionScheduleConfig> = {}): IngestionScheduleConfig {
  return {
    frequency: "NEVER",
    lastRunAt: null,
    updatedAt: "2026-09-17T00:00:00.000Z",
    ingestionAvailable: true,
    pullMode: "direct",
    workerLastSeenAt: null,
    ...overrides,
  };
}

const ME: MeProfile = {
  id: "admin-1",
  email: "admin@example.com",
  name: "Admin One",
  username: "adminone",
  avatarUrl: null,
  favoriteTeam: null,
  followedPlayers: [],
  role: "ADMIN",
};

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

function makeUser(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    id: "user-2",
    email: "other@example.com",
    name: "Other User",
    username: "otheruser",
    role: "USER",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function setUp() {
  vi.mocked(useSession).mockReturnValue({ data: { user: {} }, isPending: false } as never);
  vi.mocked(fetchMe).mockResolvedValue(ME);
  vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
  vi.mocked(fetchSeasons).mockResolvedValue(["2025-26", "2024-25"]);
}

describe("AdminPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Teams tab", () => {
    it("lists teams and edits one", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 10, total: 1 });
      vi.mocked(updateAdminTeam).mockResolvedValue({ ...LAKERS, city: "LA" });

      renderWithProviders(<AdminPage />);

      expect(await screen.findByText("Los Angeles Lakers")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Edit" }));
      const cityInput = screen.getByLabelText("City");
      await user.clear(cityInput);
      await user.type(cityInput, "LA");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(updateAdminTeam).toHaveBeenCalledWith(
          "team-1",
          expect.objectContaining({ city: "LA", name: "Lakers", abbreviation: "LAL" })
        )
      );
    });

    it("shows an error and keeps the form open when saving fails", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 10, total: 1 });
      vi.mocked(updateAdminTeam).mockRejectedValue(new Error("boom"));

      renderWithProviders(<AdminPage />);

      await screen.findByText("Los Angeles Lakers");
      await user.click(screen.getByRole("button", { name: "Edit" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("Could not save changes.")).toBeInTheDocument();
    });
  });

  describe("Players tab", () => {
    it("lists players and edits one", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminPlayers).mockResolvedValue({ data: [makePlayer()], page: 1, pageSize: 10, total: 1 });
      vi.mocked(updateAdminPlayer).mockResolvedValue(makePlayer({ jerseyNumber: "6" }));

      renderWithProviders(<AdminPage />);

      await user.click(screen.getByRole("radio", { name: "Players" }));
      expect(await screen.findByText("LeBron James")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Edit" }));
      const jerseyInput = screen.getByLabelText("Jersey #");
      await user.clear(jerseyInput);
      await user.type(jerseyInput, "6");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(updateAdminPlayer).toHaveBeenCalledWith(
          "player-1",
          expect.objectContaining({ jerseyNumber: "6", firstName: "LeBron", lastName: "James" })
        )
      );
    });
  });

  describe("Users tab", () => {
    it("disables actions on your own row", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminUsers).mockResolvedValue({
        data: [makeUser({ id: "admin-1", name: "Admin One", role: "ADMIN" })],
        page: 1,
        pageSize: 10,
        total: 1,
      });

      renderWithProviders(<AdminPage />);

      await user.click(screen.getByRole("radio", { name: "Users" }));
      expect(await screen.findByText("(you)")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Remove admin|Make admin/ })).not.toBeInTheDocument();
    });

    it("promotes a different user to admin after confirming", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminUsers).mockResolvedValue({ data: [makeUser()], page: 1, pageSize: 10, total: 1 });
      vi.mocked(updateAdminUserRole).mockResolvedValue(makeUser({ role: "ADMIN" }));

      renderWithProviders(<AdminPage />);

      await user.click(screen.getByRole("radio", { name: "Users" }));
      await screen.findByText("Other User");

      await user.click(screen.getByRole("button", { name: "Make admin" }));
      expect(screen.getByText("Grant admin access?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Yes" }));

      await waitFor(() => expect(updateAdminUserRole).toHaveBeenCalledWith("user-2", "ADMIN"));
    });

    it("cancels a delete confirmation without calling the API", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminUsers).mockResolvedValue({ data: [makeUser()], page: 1, pageSize: 10, total: 1 });

      renderWithProviders(<AdminPage />);

      await user.click(screen.getByRole("radio", { name: "Users" }));
      await screen.findByText("Other User");

      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(screen.getByText("Delete this account?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
      expect(deleteAdminUser).not.toHaveBeenCalled();
    });

    it("deletes a different user after confirming", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminUsers).mockResolvedValue({ data: [makeUser()], page: 1, pageSize: 10, total: 1 });
      vi.mocked(deleteAdminUser).mockResolvedValue({ deleted: true });

      renderWithProviders(<AdminPage />);

      await user.click(screen.getByRole("radio", { name: "Users" }));
      await screen.findByText("Other User");

      await user.click(screen.getByRole("button", { name: "Delete" }));
      await user.click(screen.getByRole("button", { name: "Yes, delete" }));

      await waitFor(() => expect(deleteAdminUser).toHaveBeenCalledWith("user-2"));
    });
  });

  describe("Batches tab", () => {
    it("lists batches and approves one", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminBatches).mockResolvedValue({
        data: [{
          id: "b1", gameId: "g1", status: "PENDING_REVIEW", source: "nba_api",
          startedAt: "2026-09-01T12:00:00.000Z", completedAt: null,
          eventsAccepted: 200, eventsRejected: 5, rejectionSummary: null,
          reviewedAt: null, reviewNotes: null,
          game: { id: "g1", gameDate: "2026-09-01", season: "2025-26", nbaGameId: "001",
            homeTeam: { name: "Lakers" }, awayTeam: { name: "Celtics" } },
          reviewedBy: null,
        }],
        page: 1, pageSize: 10, total: 1,
      });
      vi.mocked(approveAdminBatch).mockResolvedValue({} as never);

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));

      expect(await screen.findByText(/Celtics @ Lakers/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => expect(approveAdminBatch).toHaveBeenCalledWith("b1", undefined));
    });

    it("orders by game date descending by default, not by ingest time", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminBatches).mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0 });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));

      await waitFor(() =>
        expect(fetchAdminBatches).toHaveBeenCalledWith(
          expect.objectContaining({ sort: "date", order: "desc" }),
        ),
      );
    });

    it("toggles to ascending when the Date header is clicked again", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminBatches).mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0 });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));
      await screen.findByText("No batches found.");

      await user.click(screen.getByRole("button", { name: /^Date/ }));

      await waitFor(() =>
        expect(fetchAdminBatches).toHaveBeenCalledWith(
          expect.objectContaining({ sort: "date", order: "asc" }),
        ),
      );
    });

    it("sorts by a different column newest-first", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminBatches).mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0 });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));
      await screen.findByText("No batches found.");

      await user.click(screen.getByRole("button", { name: /^Ingested/ }));

      await waitFor(() =>
        expect(fetchAdminBatches).toHaveBeenCalledWith(
          expect.objectContaining({ sort: "ingested", order: "desc" }),
        ),
      );
    });

    it("pulls everything when no window is given", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminBatches).mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0 });
      vi.mocked(fetchIngestionSchedule).mockResolvedValue(makeSchedule());
      vi.mocked(triggerIngestionPull).mockResolvedValue({ started: true, message: "Ingestion queued." });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));
      await user.click(await screen.findByRole("button", { name: "Pull Data" }));

      await waitFor(() =>
        expect(triggerIngestionPull).toHaveBeenCalledWith({
          season: undefined, fromDate: undefined, toDate: undefined,
        }),
      );
    });

    it("pulls only the chosen season and date window", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminBatches).mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0 });
      vi.mocked(fetchIngestionSchedule).mockResolvedValue(makeSchedule());
      vi.mocked(triggerIngestionPull).mockResolvedValue({ started: true, message: "Ingestion queued." });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));

      await user.type(await screen.findByLabelText("Season"), "2024-25");
      await user.type(screen.getByLabelText("From"), "2026-04-14");
      await user.type(screen.getByLabelText("To"), "2026-04-18");
      await user.click(screen.getByRole("button", { name: "Pull Data" }));

      await waitFor(() =>
        expect(triggerIngestionPull).toHaveBeenCalledWith({
          season: "2024-25", fromDate: "2026-04-14", toDate: "2026-04-18",
        }),
      );
    });

    it("clears a chosen window back to a full pull", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminBatches).mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0 });
      vi.mocked(fetchIngestionSchedule).mockResolvedValue(makeSchedule());

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));

      await user.type(await screen.findByLabelText("Season"), "2024-25");
      await user.click(screen.getByRole("button", { name: "Clear" }));

      expect(screen.getByLabelText("Season")).toHaveValue("");
      expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    });

    // The deployed API can't reach stats.nba.com. It used to disable every
    // pull control there; now it queues pulls for a pull worker instead.
    it("keeps the pull controls usable and shows the queue where pulls are queued", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminBatches).mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0 });
      vi.mocked(fetchIngestionSchedule).mockResolvedValue(
        makeSchedule({ ingestionAvailable: false, pullMode: "queue", workerLastSeenAt: null }),
      );
      vi.mocked(fetchIngestionRequests).mockResolvedValue([]);

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));

      expect(await screen.findByText("Pull queue")).toBeInTheDocument();
      expect(screen.getByText(/No pull worker has checked in yet/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Pull Data" })).toBeEnabled();
      expect(screen.getByRole("combobox", { name: "Pull schedule" })).toBeEnabled();
      expect(screen.getByLabelText("Season")).toBeEnabled();
      expect(screen.getByLabelText("From")).toBeEnabled();
    });

    it("hides the queue where the API runs pulls itself", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminBatches).mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0 });
      vi.mocked(fetchIngestionSchedule).mockResolvedValue(
        makeSchedule({ frequency: "HOURLY", lastRunAt: "2026-09-16T10:00:00.000Z" }),
      );

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));

      expect(await screen.findByRole("combobox", { name: "Pull schedule" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Pull Data" })).toBeEnabled();
      expect(screen.queryByText("Pull queue")).not.toBeInTheDocument();
      expect(fetchIngestionRequests).not.toHaveBeenCalled();
    });

    it("rejects a batch", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminBatches).mockResolvedValue({
        data: [{
          id: "b2", gameId: "g2", status: "PENDING_REVIEW", source: "nba_api",
          startedAt: "2026-09-01T12:00:00.000Z", completedAt: null,
          eventsAccepted: 0, eventsRejected: 50, rejectionSummary: null,
          reviewedAt: null, reviewNotes: null,
          game: { id: "g2", gameDate: "2026-09-02", season: "2025-26", nbaGameId: "002",
            homeTeam: { name: "Lakers" }, awayTeam: { name: "Celtics" } },
          reviewedBy: null,
        }],
        page: 1, pageSize: 10, total: 1,
      });
      vi.mocked(rejectAdminBatch).mockResolvedValue({} as never);

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));
      await screen.findByText(/Celtics @ Lakers/);

      await user.click(screen.getByRole("button", { name: "Reject" }));
      await waitFor(() => expect(rejectAdminBatch).toHaveBeenCalledWith("b2", undefined));
    });

    it("shows empty state when no batches", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminBatches).mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0 });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));
      expect(await screen.findByText("No batches found.")).toBeInTheDocument();
    });

    it("shows error state on fetch failure", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminBatches).mockRejectedValue(new Error("fail"));

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));
      expect(await screen.findByText("Could not load batches.")).toBeInTheDocument();
    });
  });

  describe("Corrections tab", () => {
    const GSW = { id: "team-gsw", name: "Warriors", abbreviation: "GSW", city: "Golden State", logoUrl: null };
    const LAL = { id: "team-lal", name: "Lakers", abbreviation: "LAL", city: "Los Angeles", logoUrl: null };
    const GAME_HEADER = {
      id: "game-1", nbaGameId: "0022501181", gameDate: "2026-04-09T00:00:00.000Z", season: "2025-26",
      seasonType: "REGULAR", homeTeam: GSW, awayTeam: LAL, homeScore: 110, awayScore: 104,
    };

    function makePlayByPlay(): AdminGamePlayByPlay {
      const play = { subType: null, success: null, value: 0, creditPlayerId: null, isCorrected: false };
      return {
        game: GAME_HEADER,
        roster: [
          { id: "curry", firstName: "Stephen", lastName: "Curry", teamId: GSW.id },
          { id: "green", firstName: "Draymond", lastName: "Green", teamId: GSW.id },
          { id: "thompson", firstName: "Klay", lastName: "Thompson", teamId: GSW.id },
          { id: "james", firstName: "LeBron", lastName: "James", teamId: LAL.id },
        ],
        eventTypes: ["2pt", "3pt", "freethrow", "rebound", "turnover", "foul", "violation", "timeout", "substitution", "jumpball", "ejection", "period", "game", "instant replay", "heave"],
        events: [
          { ...play, sequence: 1, period: 1, clock: "PT11M30.00S", eventType: "3pt", subType: "Jump Shot", playerId: "curry", playerName: "Stephen Curry", teamId: GSW.id, success: true, value: 3, description: "Curry 26' 3PT Jump Shot (3 PTS) (Green 1 AST)", creditPlayerId: "green" },
          { ...play, sequence: 2, period: 1, clock: "PT11M00.00S", eventType: "foul", subType: "Personal", playerId: "green", playerName: "Draymond Green", teamId: GSW.id, description: "Green P.FOUL (P1.T1)" },
          { ...play, sequence: 3, period: 2, clock: "PT07M45.00S", eventType: "2pt", subType: "Layup", playerId: "james", playerName: "LeBron James", teamId: LAL.id, success: false, value: 2, description: "MISS James 5' Layup", isCorrected: true },
          { ...play, sequence: 4, period: 2, clock: "PT07M40.00S", eventType: "rebound", subType: "defensive", playerId: "green", playerName: "Draymond Green", teamId: GSW.id, description: "Green REBOUND (Off:0 Def:1)" },
          { ...play, sequence: 5, period: 2, clock: "PT07M00.00S", eventType: "substitution", playerId: "thompson", playerName: "Klay Thompson", teamId: GSW.id, description: "SUB: Thompson FOR Curry" },
        ],
      };
    }

    function makeCorrection(overrides: Partial<EventCorrection> = {}): EventCorrection {
      return {
        id: "ec1", gameId: "game-1", sequence: 1,
        previousValues: { playerId: "curry" }, newValues: { playerId: "green" },
        correctedById: "admin-1", reason: "Wrong shooter", correctedAt: "2026-09-18T12:00:00.000Z",
        revertsCorrectionId: null,
        game: {
          id: "game-1", gameDate: "2026-04-09T00:00:00.000Z", season: "2025-26", nbaGameId: "0022501181",
          homeTeam: { id: GSW.id, name: GSW.name, abbreviation: GSW.abbreviation },
          awayTeam: { id: LAL.id, name: LAL.name, abbreviation: LAL.abbreviation },
        },
        correctedBy: { id: "admin-1", name: "Admin One" },
        revertedBy: null,
        playerNames: { curry: "Stephen Curry", green: "Draymond Green" },
        ...overrides,
      };
    }

    const SAVED = {
      gameId: "game-1", sequence: 1, season: "2025-26", changes: [], statChanges: [],
      correction: { id: "ec2" }, releasesMarkedStale: 1,
    };
    const EMPTY_OUTCOME = { gameId: "game-1", sequence: 1, season: "2025-26", changes: [], statChanges: [] };

    function setUpCorrections(corrections: EventCorrection[] = [makeCorrection()]) {
      setUp();
      vi.mocked(fetchAdminCorrections).mockResolvedValue({ data: corrections, page: 1, pageSize: 10, total: corrections.length });
      vi.mocked(fetchAdminGames).mockResolvedValue({
        data: [{ ...GAME_HEADER, eventCount: 480, correctionCount: 1 }], page: 1, pageSize: 10, total: 1,
      });
      vi.mocked(fetchAdminPlayByPlay).mockResolvedValue(makePlayByPlay());
    }

    async function openCorrectionsTab(user: ReturnType<typeof userEvent.setup>) {
      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Corrections" }));
    }

    async function openGame(user: ReturnType<typeof userEvent.setup>) {
      await openCorrectionsTab(user);
      await user.click(await screen.findByRole("button", { name: "Open plays" }));
      await screen.findByRole("button", { name: "Edit play 1" });
    }

    async function editPlay(user: ReturnType<typeof userEvent.setup>, sequence: number) {
      await user.click(screen.getByRole("button", { name: `Edit play ${sequence}` }));
      return screen.getByRole("form", { name: "Correct play" });
    }

    it("shows the history with the matchup, old → new values, reason, who and when", async () => {
      setUpCorrections();
      const user = userEvent.setup();

      await openCorrectionsTab(user);

      const history = await screen.findByRole("region", { name: "Correction history" });
      expect(await within(history).findByText("Wrong shooter")).toBeInTheDocument();
      expect(within(history).getByText("LAL @ GSW")).toBeInTheDocument();
      expect(within(history).getByText(/Stephen Curry → Draymond Green/)).toBeInTheDocument();
      expect(within(history).getByText("Admin One")).toBeInTheDocument();
      expect(fetchAdminCorrections).toHaveBeenCalledWith({ gameId: undefined, page: 1, pageSize: 10 });
    });

    it("shows empty state", async () => {
      setUpCorrections([]);
      const user = userEvent.setup();

      await openCorrectionsTab(user);

      expect(await screen.findByText("No corrections recorded yet.")).toBeInTheDocument();
    });

    it("finds games by season, team and date, with each game's play count", async () => {
      setUpCorrections();
      const user = userEvent.setup();

      await openCorrectionsTab(user);
      expect(await screen.findByText("480")).toBeInTheDocument();
      await user.selectOptions(await screen.findByRole("combobox", { name: "Season" }), "2025-26");
      await user.selectOptions(screen.getByRole("combobox", { name: "Team" }), LAKERS.id);
      fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-04-08" } });
      fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-04-10" } });

      await waitFor(() =>
        expect(fetchAdminGames).toHaveBeenLastCalledWith({
          season: "2025-26", teamId: LAKERS.id, fromDate: "2026-04-08", toDate: "2026-04-10", page: 1, pageSize: 10,
        }),
      );
    });

    it("opens a game's plays and filters them by quarter, player and play type", async () => {
      setUpCorrections();
      const user = userEvent.setup();

      await openGame(user);
      expect(fetchAdminPlayByPlay).toHaveBeenCalledWith("game-1");
      expect(screen.getAllByRole("button", { name: /^Edit play/ })).toHaveLength(5);
      expect(screen.getByText("11:30")).toBeInTheDocument();

      await user.selectOptions(screen.getByRole("combobox", { name: "Quarter" }), "2");
      expect(screen.getAllByRole("button", { name: /^Edit play/ })).toHaveLength(3);
      await user.selectOptions(screen.getByRole("combobox", { name: "Player" }), "green");
      expect(screen.getAllByRole("button", { name: /^Edit play/ })).toHaveLength(1);
      await user.selectOptions(screen.getByRole("combobox", { name: "Player" }), "");
      await user.selectOptions(screen.getByRole("combobox", { name: "Play type" }), "rebound");
      expect(screen.getByRole("button", { name: "Edit play 4" })).toBeInTheDocument();
      expect(screen.getByText("Showing 1 of 5 plays")).toBeInTheDocument();
    });

    it("previews a correction's stat changes, then saves exactly that and flags stale releases", async () => {
      setUpCorrections();
      vi.mocked(previewEventCorrection).mockResolvedValue({
        ...EMPTY_OUTCOME,
        changes: [{ field: "playerId", from: "curry", to: "thompson" }],
        statChanges: [
          { playerId: "curry", playerName: "Stephen Curry", stats: [{ field: "points", before: 3, after: 0 }] },
          { playerId: "thompson", playerName: "Klay Thompson", stats: [{ field: "points", before: 0, after: 3 }] },
        ],
      });
      vi.mocked(correctGameEvent).mockResolvedValue(SAVED);
      const user = userEvent.setup();
      await openGame(user);

      const form = await editPlay(user, 1);
      await user.selectOptions(within(form).getByLabelText("Player"), "thompson");
      await user.type(within(form).getByLabelText("Reason (required)"), "Wrong shooter");
      await user.click(within(form).getByRole("button", { name: "Preview changes" }));

      const expectedBody = { playerId: "thompson", reason: "Wrong shooter" };
      expect(previewEventCorrection).toHaveBeenCalledWith("game-1", 1, expectedBody);
      const preview = await within(form).findByRole("region", { name: "Correction preview" });
      expect(within(preview).getByText(/Stephen Curry → Klay Thompson/)).toBeInTheDocument();
      expect(within(preview).getAllByText("PTS")).toHaveLength(2);
      expect(correctGameEvent).not.toHaveBeenCalled();

      await user.click(within(form).getByRole("button", { name: "Confirm and save" }));

      expect(correctGameEvent).toHaveBeenCalledWith("game-1", 1, expectedBody);
      const notice = await screen.findByRole("status");
      expect(notice).toHaveTextContent("Correction saved. 1 published 2025-26 dataset release is now marked stale.");
      expect(within(notice).getByRole("link", { name: /Datasets page/ })).toHaveAttribute("href", "/datasets");
      await waitFor(() => expect(fetchAdminPlayByPlay).toHaveBeenCalledTimes(2));
      expect(screen.queryByRole("form", { name: "Correct play" })).not.toBeInTheDocument();
    });

    it("needs a reason before previewing", async () => {
      setUpCorrections();
      const user = userEvent.setup();
      await openGame(user);

      const form = await editPlay(user, 1);
      await user.selectOptions(within(form).getByLabelText("Player"), "thompson");
      await user.click(within(form).getByRole("button", { name: "Preview changes" }));

      expect(within(form).getByRole("alert")).toHaveTextContent("Give a reason for this correction.");
      expect(previewEventCorrection).not.toHaveBeenCalled();
    });

    it("sets the assist with the credit picker, and swaps it for a block when the shot is missed", async () => {
      setUpCorrections();
      vi.mocked(previewEventCorrection).mockResolvedValue(EMPTY_OUTCOME);
      const user = userEvent.setup();
      await openGame(user);

      const form = await editPlay(user, 1);
      const assistPicker = within(form).getByLabelText("Assisted by");
      expect(assistPicker).toHaveValue("green");
      expect(within(assistPicker).queryByRole("option", { name: "LeBron James" })).not.toBeInTheDocument();

      await user.selectOptions(within(form).getByLabelText("Made / missed"), "missed");
      expect(within(form).queryByLabelText("Assisted by")).not.toBeInTheDocument();
      await user.selectOptions(within(form).getByLabelText("Blocked by"), "james");
      await user.type(within(form).getByLabelText("Reason (required)"), "Rimmed out, James blocked it");
      await user.click(within(form).getByRole("button", { name: "Preview changes" }));

      expect(previewEventCorrection).toHaveBeenCalledWith("game-1", 1, {
        success: false, creditPlayerId: "james", reason: "Rimmed out, James blocked it",
      });
    });

    it("clears the assist when the credited passer is made the shooter", async () => {
      setUpCorrections();
      vi.mocked(previewEventCorrection).mockResolvedValue(EMPTY_OUTCOME);
      const user = userEvent.setup();
      await openGame(user);

      const form = await editPlay(user, 1);
      await user.selectOptions(within(form).getByLabelText("Player"), "green");
      expect(within(form).getByLabelText("Assisted by")).toHaveValue("");
      await user.type(within(form).getByLabelText("Reason (required)"), "Green took the shot");
      await user.click(within(form).getByRole("button", { name: "Preview changes" }));

      expect(previewEventCorrection).toHaveBeenCalledWith("game-1", 1, {
        playerId: "green", creditPlayerId: null, reason: "Green took the shot",
      });
    });

    it("edits the clock as m:ss and sends the stored form", async () => {
      setUpCorrections();
      vi.mocked(previewEventCorrection).mockResolvedValue(EMPTY_OUTCOME);
      const user = userEvent.setup();
      await openGame(user);

      const form = await editPlay(user, 1);
      const clock = within(form).getByLabelText("Clock (m:ss)");
      expect(clock).toHaveValue("11:30");
      await user.clear(clock);
      await user.type(clock, "11:25");
      await user.type(within(form).getByLabelText("Reason (required)"), "Clock sync");
      await user.click(within(form).getByRole("button", { name: "Preview changes" }));

      expect(previewEventCorrection).toHaveBeenCalledWith("game-1", 1, { clock: "PT11M25.00S", reason: "Clock sync" });
    });

    it("shows the API's reason when a preview is rejected", async () => {
      setUpCorrections();
      vi.mocked(previewEventCorrection).mockRejectedValue(new ApiError("value 5 doesn't fit a made 3pt", 400));
      const user = userEvent.setup();
      await openGame(user);

      const form = await editPlay(user, 1);
      await user.selectOptions(within(form).getByLabelText("Player"), "thompson");
      await user.type(within(form).getByLabelText("Reason (required)"), "test");
      await user.click(within(form).getByRole("button", { name: "Preview changes" }));

      expect(await within(form).findByRole("alert")).toHaveTextContent("value 5 doesn't fit a made 3pt");
      expect(within(form).queryByRole("button", { name: "Confirm and save" })).not.toBeInTheDocument();
    });

    it("recalculates the selected game's stats and reports how many players were recomputed", async () => {
      setUpCorrections();
      vi.mocked(replayAdminGame).mockResolvedValue({ gameId: "game-1", playersRecomputed: 18, playersChanged: 2 });
      const user = userEvent.setup();
      await openGame(user);

      await user.click(screen.getByRole("button", { name: "Recalculate stats" }));

      expect(replayAdminGame).toHaveBeenCalledWith("game-1");
      expect(await screen.findByText(/Recalculated 18 players' stats from this game's plays; 2 changed/)).toBeInTheDocument();
    });

    it("filters the history to the selected game", async () => {
      setUpCorrections();
      const user = userEvent.setup();
      await openGame(user);

      expect(fetchAdminCorrections).toHaveBeenLastCalledWith({ gameId: "game-1", page: 1, pageSize: 10 });
      expect(screen.getByRole("heading", { name: "This game's correction history" })).toBeInTheDocument();
    });

    it("undoes a correction with a reason", async () => {
      setUpCorrections();
      vi.mocked(revertEventCorrection).mockResolvedValue(SAVED);
      const user = userEvent.setup();
      await openCorrectionsTab(user);

      const history = await screen.findByRole("region", { name: "Correction history" });
      await user.click(await within(history).findByRole("button", { name: "Undo" }));
      expect(within(history).getByRole("button", { name: "Confirm undo" })).toBeDisabled();
      await user.type(within(history).getByLabelText("Reason for undoing"), "Curry did take it");
      await user.click(within(history).getByRole("button", { name: "Confirm undo" }));

      expect(revertEventCorrection).toHaveBeenCalledWith("ec1", "Curry did take it");
      expect(await screen.findByRole("status")).toHaveTextContent("Correction undone.");
    });

    it("shows why an undo was refused, and no Undo on a correction already undone", async () => {
      setUpCorrections([
        makeCorrection(),
        makeCorrection({ id: "ec0", reason: "Old fix", revertedBy: { id: "ec9", correctedAt: "2026-09-18T13:00:00.000Z" } }),
      ]);
      vi.mocked(revertEventCorrection).mockRejectedValue(
        new ApiError("A later correction changed the same fields of this play; undo that one first", 409),
      );
      const user = userEvent.setup();
      await openCorrectionsTab(user);

      const history = await screen.findByRole("region", { name: "Correction history" });
      expect(await within(history).findByText("Undone")).toBeInTheDocument();
      expect(within(history).getAllByRole("button", { name: "Undo" })).toHaveLength(1);
      await user.click(within(history).getByRole("button", { name: "Undo" }));
      await user.type(within(history).getByLabelText("Reason for undoing"), "undo");
      await user.click(within(history).getByRole("button", { name: "Confirm undo" }));

      expect(await within(history).findByRole("alert")).toHaveTextContent(/undo that one first/);
    });

    it("opens a batch's game in the Corrections tab from the Batches tab", async () => {
      setUpCorrections();
      vi.mocked(fetchAdminBatches).mockResolvedValue({
        data: [{
          id: "b1", gameId: "game-1", status: "COMPLETED", source: "nba_api",
          startedAt: "2026-09-01T12:00:00.000Z", completedAt: null,
          eventsAccepted: 480, eventsRejected: 0, rejectionSummary: null,
          reviewedAt: null, reviewNotes: null,
          game: { id: "game-1", gameDate: "2026-04-09", season: "2025-26", nbaGameId: "0022501181",
            homeTeam: { name: "Warriors" }, awayTeam: { name: "Lakers" } },
          reviewedBy: null,
        }],
        page: 1, pageSize: 10, total: 1,
      });
      const user = userEvent.setup();

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));
      await user.click(await screen.findByRole("button", { name: "Correct plays" }));

      expect(screen.getByRole("radio", { name: "Corrections" })).toHaveAttribute("aria-checked", "true");
      expect(await screen.findByRole("button", { name: "Edit play 1" })).toBeInTheDocument();
      expect(fetchAdminPlayByPlay).toHaveBeenCalledWith("game-1");
    });
  });

  describe("API Keys tab", () => {
    it("lists consumers and generates a key", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminConsumers).mockResolvedValue({
        data: [{
          id: "c1", name: "TestApp", contactEmail: "test@example.com",
          kind: "EXTERNAL", user: null,
          rateLimit: 60, dailyQuota: 1000, isActive: true,
          createdAt: "2026-09-01T12:00:00.000Z",
          keys: [{ id: "k1", label: "prod", isActive: true, lastUsedAt: null, createdAt: "2026-09-01" }],
          _count: { usageLog: 42 },
        }],
        page: 1, pageSize: 10, total: 1,
      });
      vi.mocked(createAdminApiKey).mockResolvedValue({
        id: "k2", label: null, rawKey: "nba_secret_key_123", createdAt: "2026-09-01",
      });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "API Keys" }));

      expect(await screen.findByText("TestApp")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Generate Key" }));
      await waitFor(() => expect(createAdminApiKey).toHaveBeenCalledWith("c1"));
    });

    it("differentiates user-owned consumers from external ones", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminConsumers).mockResolvedValue({
        data: [
          {
            id: "c1", name: "Stats LLC", contactEmail: "ops@statsllc.com",
            kind: "EXTERNAL", user: null,
            rateLimit: 100, dailyQuota: 10000, isActive: true,
            createdAt: "2026-09-01",
            keys: [],
            _count: { usageLog: 0 },
          },
          {
            id: "c2", name: "Owen Pace", contactEmail: "owen@example.com",
            kind: "USER", user: { id: "u1", name: "Owen Pace", email: "owen@example.com" },
            rateLimit: 60, dailyQuota: 5000, isActive: true,
            createdAt: "2026-09-10",
            keys: [],
            _count: { usageLog: 3 },
          },
        ],
        page: 1, pageSize: 10, total: 2,
      });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "API Keys" }));

      expect(await screen.findByText("Stats LLC")).toBeInTheDocument();
      expect(screen.getByText("Admin key")).toBeInTheDocument();
      expect(screen.getByText("User key")).toBeInTheDocument();
      // the owner identity comes from the live account relation, not the
      // provisioning-time contactEmail copy
      expect(screen.getByText("owen@example.com")).toBeInTheDocument();
    });

    it("creates a new consumer", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminConsumers).mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0 });
      vi.mocked(createAdminConsumer).mockResolvedValue({
        id: "c2", name: "NewApp", contactEmail: null,
        rateLimit: 60, dailyQuota: 1000, isActive: true,
        createdAt: "2026-09-01", keys: [], _count: { usageLog: 0 },
      } as never);

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "API Keys" }));

      await user.type(screen.getByPlaceholderText("Consumer name"), "NewApp");
      await user.click(screen.getByRole("button", { name: "Create" }));
      await waitFor(() => expect(createAdminConsumer).toHaveBeenCalledWith(
        expect.objectContaining({ name: "NewApp" })
      ));
    });

    it("revokes an active key", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminConsumers).mockResolvedValue({
        data: [{
          id: "c1", name: "TestApp", contactEmail: null,
          kind: "EXTERNAL", user: null,
          rateLimit: 60, dailyQuota: 1000, isActive: true,
          createdAt: "2026-09-01",
          keys: [{ id: "k1", label: null, isActive: true, lastUsedAt: null, createdAt: "2026-09-01" }],
          _count: { usageLog: 0 },
        }],
        page: 1, pageSize: 10, total: 1,
      });
      vi.mocked(revokeAdminApiKey).mockResolvedValue({ revoked: true });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "API Keys" }));
      await screen.findByText("TestApp");

      await user.click(screen.getByRole("button", { name: "Revoke" }));
      await waitFor(() => expect(revokeAdminApiKey).toHaveBeenCalledWith("c1", "k1"));
    });

    it("deletes a key after confirming", async () => {
      setUp();
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      vi.mocked(fetchAdminConsumers).mockResolvedValue({
        data: [{
          id: "c1", name: "TestApp", contactEmail: null,
          kind: "EXTERNAL", user: null,
          rateLimit: 60, dailyQuota: 1000, isActive: true,
          createdAt: "2026-09-01",
          keys: [{ id: "k1", label: "prod", isActive: true, lastUsedAt: null, createdAt: "2026-09-01" }],
          _count: { usageLog: 0 },
        }],
        page: 1, pageSize: 10, total: 1,
      });
      vi.mocked(deleteAdminApiKey).mockResolvedValue({ deleted: true });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "API Keys" }));
      await screen.findByText("TestApp");

      const keyRow = screen.getByText("prod").closest("div")!;
      await user.click(within(keyRow).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(deleteAdminApiKey).toHaveBeenCalledWith("c1", "k1"));
    });

    it("deletes a consumer after confirming", async () => {
      setUp();
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      vi.mocked(fetchAdminConsumers).mockResolvedValue({
        data: [{
          id: "c1", name: "TestApp", contactEmail: null,
          kind: "EXTERNAL", user: null,
          rateLimit: 60, dailyQuota: 1000, isActive: true,
          createdAt: "2026-09-01",
          keys: [],
          _count: { usageLog: 0 },
        }],
        page: 1, pageSize: 10, total: 1,
      });
      vi.mocked(deleteAdminConsumer).mockResolvedValue({ deleted: true });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "API Keys" }));
      await screen.findByText("TestApp");

      await user.click(screen.getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(deleteAdminConsumer).toHaveBeenCalledWith("c1"));
    });

    it("does not delete a consumer when confirmation is cancelled", async () => {
      setUp();
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(false);
      vi.mocked(fetchAdminConsumers).mockResolvedValue({
        data: [{
          id: "c1", name: "TestApp", contactEmail: null,
          kind: "EXTERNAL", user: null,
          rateLimit: 60, dailyQuota: 1000, isActive: true,
          createdAt: "2026-09-01",
          keys: [],
          _count: { usageLog: 0 },
        }],
        page: 1, pageSize: 10, total: 1,
      });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "API Keys" }));
      await screen.findByText("TestApp");

      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(deleteAdminConsumer).not.toHaveBeenCalled();
    });

    it("shows error state", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminConsumers).mockRejectedValue(new Error("fail"));

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "API Keys" }));
      expect(await screen.findByText("Could not load API consumers.")).toBeInTheDocument();
    });
  });
});
