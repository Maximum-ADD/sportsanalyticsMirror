import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminGate } from "./AdminGate";
import { useSession } from "@/lib/authClient";
import { fetchMe } from "@/lib/meApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { MeProfile } from "@/types/nba";

vi.mock("@/lib/authClient", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/meApi", () => ({
  fetchMe: vi.fn(),
}));

function makeMe(overrides: Partial<MeProfile> = {}): MeProfile {
  return {
    id: "user-1",
    email: "player@example.com",
    name: "Player One",
    username: "playerone",
    avatarUrl: null,
    favoriteTeam: null,
    followedPlayers: [],
    role: "USER",
    ...overrides,
  };
}

describe("AdminGate", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading placeholder while GET /v1/me is pending", () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: {} }, isPending: false } as never);
    vi.mocked(fetchMe).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<AdminGate>Admin content</AdminGate>);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
  });

  it("blocks a signed-in non-admin with a plain message, not a redirect", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: {} }, isPending: false } as never);
    vi.mocked(fetchMe).mockResolvedValue(makeMe({ role: "USER" }));

    renderWithProviders(<AdminGate>Admin content</AdminGate>);

    expect(await screen.findByText("Admins only")).toBeInTheDocument();
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
  });

  it("blocks an ANALYST the same way as a plain USER", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: {} }, isPending: false } as never);
    vi.mocked(fetchMe).mockResolvedValue(makeMe({ role: "ANALYST" }));

    renderWithProviders(<AdminGate>Admin content</AdminGate>);

    expect(await screen.findByText("Admins only")).toBeInTheDocument();
  });

  it("renders the protected content for an ADMIN", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: {} }, isPending: false } as never);
    vi.mocked(fetchMe).mockResolvedValue(makeMe({ role: "ADMIN" }));

    renderWithProviders(<AdminGate>Admin content</AdminGate>);

    expect(await screen.findByText("Admin content")).toBeInTheDocument();
  });
});
