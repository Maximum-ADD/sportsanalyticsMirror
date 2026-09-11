import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileGate } from "./ProfileGate";
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

const ONBOARDED_ME: MeProfile = {
  id: "user-1",
  email: "player@example.com",
  name: "Player One",
  username: "playerone",
  avatarUrl: null,
  favoriteTeam: null,
  followedPlayers: [],
};

function renderGate(initialPath = "/home") {
  return renderWithProviders(
    <Routes>
      <Route path="/home" element={<ProfileGate>Protected content</ProfileGate>} />
      <Route path="/onboarding" element={<div>Onboarding page</div>} />
    </Routes>,
    [initialPath]
  );
}

describe("ProfileGate", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading placeholder while GET /v1/me is pending", () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: {} }, isPending: false } as never);
    vi.mocked(fetchMe).mockReturnValue(new Promise(() => {}));

    renderGate();

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("redirects to /onboarding when the profile has no username yet", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: {} }, isPending: false } as never);
    vi.mocked(fetchMe).mockResolvedValue({ ...ONBOARDED_ME, username: null });

    renderGate();

    expect(await screen.findByText("Onboarding page")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders the protected content for an already-onboarded user", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: {} }, isPending: false } as never);
    vi.mocked(fetchMe).mockResolvedValue(ONBOARDED_ME);

    renderGate();

    expect(await screen.findByText("Protected content")).toBeInTheDocument();
  });
});
