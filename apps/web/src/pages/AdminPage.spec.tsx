import { screen, waitFor, within } from "@testing-library/react";
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
} from "@/lib/adminApi";
import { fetchTeams } from "@/lib/nbaApi";
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
}));

vi.mock("@/lib/nbaApi", () => ({
  fetchTeams: vi.fn(),
}));

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

    it("disables the schedule and explains when ingestion is unavailable on this server", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminBatches).mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0 });
      vi.mocked(fetchIngestionSchedule).mockResolvedValue({
        frequency: "NEVER",
        lastRunAt: null,
        updatedAt: "2026-09-17T00:00:00.000Z",
        ingestionAvailable: false,
      });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));

      expect(await screen.findByText(/Scheduling unavailable on this server/)).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Pull schedule" })).toBeDisabled();
    });

    it("keeps the schedule enabled when ingestion is available", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminBatches).mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0 });
      vi.mocked(fetchIngestionSchedule).mockResolvedValue({
        frequency: "HOURLY",
        lastRunAt: "2026-09-16T10:00:00.000Z",
        updatedAt: "2026-09-16T09:00:00.000Z",
        ingestionAvailable: true,
      });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Batches" }));

      expect(await screen.findByRole("combobox", { name: "Pull schedule" })).toBeEnabled();
      expect(screen.queryByText(/Scheduling unavailable on this server/)).not.toBeInTheDocument();
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
    it("lists corrections", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminCorrections).mockResolvedValue({
        data: [{
          id: "ec1", gameId: "g1", sequence: 5,
          previousValues: { value: 2 }, newValues: { value: 3 },
          correctedById: "u1", reason: "Corrected scoring",
          correctedAt: "2026-09-01T12:00:00.000Z",
          game: { id: "g1", gameDate: "2026-09-01", season: "2025-26", nbaGameId: "001" },
          correctedBy: { id: "u1", name: "Admin One" },
        }],
        page: 1, pageSize: 10, total: 1,
      });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Corrections" }));

      expect(await screen.findByText("Corrected scoring")).toBeInTheDocument();
      expect(screen.getByText("value")).toBeInTheDocument();
    });

    it("shows empty state", async () => {
      setUp();
      const user = userEvent.setup();
      vi.mocked(fetchAdminCorrections).mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0 });

      renderWithProviders(<AdminPage />);
      await user.click(screen.getByRole("radio", { name: "Corrections" }));
      expect(await screen.findByText("No corrections recorded yet.")).toBeInTheDocument();
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
