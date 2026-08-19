import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useSession } from "@/lib/authClient";

vi.mock("@/lib/authClient", () => ({
  signInWithGoogle: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("./components/Navbar", () => ({ Navbar: () => <nav>Navigation</nav> }));
vi.mock("./pages/HomePage", () => ({ HomePage: () => <div>Home page</div> }));
vi.mock("./pages/PlayersListPage", () => ({ PlayersListPage: () => <div>Players page</div> }));
vi.mock("./pages/PlayerProfilePage", () => ({ PlayerProfilePage: () => <div>Player details</div> }));
vi.mock("./pages/TeamsListPage", () => ({ TeamsListPage: () => <div>Teams page</div> }));
vi.mock("./pages/TeamProfilePage", () => ({ TeamProfilePage: () => <div>Team details</div> }));
vi.mock("./pages/OptimizerPage", () => ({ OptimizerPage: () => <div>Optimizer page</div> }));
vi.mock("./pages/PredictionsPage", () => ({ PredictionsPage: () => <div>Predictions page</div> }));
vi.mock("./pages/GameDetailPage", () => ({ GameDetailPage: () => <div>Game details</div> }));

const PUBLIC_ROUTES = [
  ["/", "Home page"],
  ["/players", "Players page"],
  ["/players/player-1", "Player details"],
  ["/teams", "Teams page"],
  ["/teams/team-1", "Team details"],
] as const;

const PROTECTED_ROUTES = [
  ["/optimizer", "Optimizer page"],
  ["/predictions", "Predictions page"],
  ["/games/game-1", "Game details"],
] as const;

describe("App routes", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    vi.clearAllMocks();
  });

  it.each(PUBLIC_ROUTES)("keeps %s public", (path, pageText) => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);
    window.history.pushState({}, "", path);

    render(<App />);

    expect(screen.getByText(pageText)).toBeInTheDocument();
    expect(screen.queryByText("Sign in required")).not.toBeInTheDocument();
  });

  it.each(PROTECTED_ROUTES)("requires a session for %s", (path, pageText) => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);
    window.history.pushState({}, "", path);

    render(<App />);

    expect(screen.getByRole("heading", { name: "Sign in required" })).toBeInTheDocument();
    expect(screen.queryByText(pageText)).not.toBeInTheDocument();
  });

  it.each(PROTECTED_ROUTES)("renders %s for a signed-in visitor", (path, pageText) => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: "player@example.com" } },
      isPending: false,
    } as never);
    window.history.pushState({}, "", path);

    render(<App />);

    expect(screen.getByText(pageText)).toBeInTheDocument();
  });
});
