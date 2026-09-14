import { screen, waitFor } from "@testing-library/react";
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
});
