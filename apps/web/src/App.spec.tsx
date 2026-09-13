import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { fetchGames } from "@/lib/nbaApi";
import { fetchMe } from "@/lib/meApi";
import { useSession } from "@/lib/authClient";
import type { MeProfile } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchGames: vi.fn(),
}));

vi.mock("@/lib/meApi", () => ({
  fetchMe: vi.fn(),
}));

vi.mock("@/lib/authClient", () => ({
  authClient: { signIn: { social: vi.fn() }, signOut: vi.fn(), deleteUser: vi.fn() },
  signInWithGoogle: vi.fn(),
  useSession: vi.fn(),
}));

// The pages are stubbed, but the app shell and shared header are left real: which
// routes sit inside the shell (and which sit outside it, like the landing
// page) is exactly what these tests are asserting.
vi.mock("./pages/LandingPage", () => ({ LandingPage: () => <div>Landing page</div> }));
vi.mock("./pages/HomePage", () => ({ HomePage: () => <div>Home page</div> }));
vi.mock("./pages/PlayersListPage", () => ({ PlayersListPage: () => <div>Players page</div> }));
vi.mock("./pages/PlayerProfilePage", () => ({ PlayerProfilePage: () => <div>Player details</div> }));
vi.mock("./pages/TeamsListPage", () => ({ TeamsListPage: () => <div>Teams page</div> }));
vi.mock("./pages/TeamProfilePage", () => ({ TeamProfilePage: () => <div>Team details</div> }));
vi.mock("./pages/OptimizerPage", () => ({ OptimizerPage: () => <div>Optimizer page</div> }));
vi.mock("./pages/PredictionsPage", () => ({ PredictionsPage: () => <div>Predictions page</div> }));
vi.mock("./pages/GameDetailPage", () => ({ GameDetailPage: () => <div>Game details</div> }));
vi.mock("./pages/OnboardingPage", () => ({ OnboardingPage: () => <div>Onboarding page</div> }));
vi.mock("./pages/ProfilePage", () => ({ ProfilePage: () => <div>Profile page</div> }));

const SIGNED_OUT = { data: null, isPending: false } as never;
const SIGNED_IN = { data: { user: { email: "player@example.com", name: "Player" } }, isPending: false } as never;

// A fully onboarded user (real username) — ProfileGate only redirects to
// /onboarding when username is null, so every "signed-in visitor" test
// below needs this to reach its target route instead of bouncing to
// onboarding.
const ONBOARDED_ME = { username: "playerone", avatarUrl: null, favoriteTeam: null, followedPlayers: [] } as unknown as MeProfile;

const PUBLIC_ROUTES = [
  ["/players", "Players page"],
  ["/players/player-1", "Player details"],
  ["/teams", "Teams page"],
  ["/teams/team-1", "Team details"],
] as const;

const PROTECTED_ROUTES = [
  ["/home", "Home page"],
  ["/optimizer", "Optimizer page"],
  ["/predictions", "Predictions page"],
  ["/games/game-1", "Game details"],
] as const;

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(fetchGames).mockResolvedValue({ data: [], page: 1, pageSize: 1, total: 0 });
  vi.mocked(useSession).mockReturnValue(SIGNED_OUT);
  vi.mocked(fetchMe).mockResolvedValue(ONBOARDED_ME);
});

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("App routes", () => {
  it('serves the landing page at "/", outside the app shell', () => {
    renderAt("/");

    expect(screen.getByText("Landing page")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
  });

  it("keeps the shared header's Home link inside the app", () => {
    renderAt("/home");

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("link", { name: "Optimizer" })).toHaveAttribute("href", "/optimizer");
    expect(screen.getByRole("link", { name: "Predictions" })).toHaveAttribute("href", "/predictions");
  });

  it.each(PUBLIC_ROUTES)("keeps %s public", (path, pageText) => {
    renderAt(path);

    expect(screen.getByText(pageText)).toBeInTheDocument();
    expect(screen.queryByText("Sign in required")).not.toBeInTheDocument();
  });

  it.each(PROTECTED_ROUTES)("requires a session for %s", (path, pageText) => {
    renderAt(path);

    expect(screen.getByRole("heading", { name: "Sign in required" })).toBeInTheDocument();
    expect(screen.queryByText(pageText)).not.toBeInTheDocument();
  });

  it.each(PROTECTED_ROUTES)("renders %s for a signed-in, onboarded visitor", async (path, pageText) => {
    vi.mocked(useSession).mockReturnValue(SIGNED_IN);

    renderAt(path);

    expect(await screen.findByText(pageText)).toBeInTheDocument();
  });

  it('serves the app home at "/home" for a signed-in visitor, inside the app shell', async () => {
    vi.mocked(useSession).mockReturnValue(SIGNED_IN);

    renderAt("/home");

    expect(await screen.findByText("Home page")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });

  it("redirects a signed-in visitor with no username to /onboarding", async () => {
    vi.mocked(useSession).mockReturnValue(SIGNED_IN);
    vi.mocked(fetchMe).mockResolvedValue({ ...ONBOARDED_ME, username: null });

    renderAt("/home");

    expect(await screen.findByText("Onboarding page")).toBeInTheDocument();
    expect(screen.queryByText("Home page")).not.toBeInTheDocument();
  });

  it("does not redirect away from /onboarding itself for a not-yet-onboarded visitor", async () => {
    vi.mocked(useSession).mockReturnValue(SIGNED_IN);
    vi.mocked(fetchMe).mockResolvedValue({ ...ONBOARDED_ME, username: null });

    renderAt("/onboarding");

    expect(await screen.findByText("Onboarding page")).toBeInTheDocument();
  });
});
