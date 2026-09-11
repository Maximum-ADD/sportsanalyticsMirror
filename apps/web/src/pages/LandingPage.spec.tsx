import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "./LandingPage";
import { fetchGames } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import { signInWithGoogle, useSession } from "@/lib/authClient";

vi.mock("@/lib/nbaApi", () => ({
  fetchGames: vi.fn(),
}));

vi.mock("@/lib/authClient", () => ({
  authClient: { signOut: vi.fn(), deleteUser: vi.fn() },
  signInWithGoogle: vi.fn(),
  useSession: vi.fn(),
}));

const SIGNED_OUT = { data: null, isPending: false } as never;
const SIGNED_IN = { data: { user: { email: "player@example.com" } }, isPending: false } as never;

afterEach(() => {
  vi.clearAllMocks();
});

function renderLanding() {
  vi.mocked(fetchGames).mockResolvedValue({ data: [], page: 1, pageSize: 1, total: 0 });
  vi.mocked(useSession).mockReturnValue(SIGNED_OUT);
  return renderWithProviders(<LandingPage />);
}

describe("LandingPage", () => {
  it("renders the three-line wordmark as a single heading", () => {
    renderLanding();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /NBA\s*Fantasy League\s*Optimizer/
    );
  });

  it("renders both section headings", () => {
    renderLanding();

    expect(screen.getByRole("heading", { level: 2, name: "What We Do" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /How We\s*Stand Out/ })).toBeInTheDocument();
  });

  it("renders both reels with their real content", () => {
    renderLanding();

    const team = screen.getByRole("region", { name: "Development team" });
    expect(team).toHaveTextContent("Owen");
    expect(team).toHaveTextContent("Sanele");

    const stack = screen.getByRole("region", { name: "Our tech stack" });
    expect(stack).toHaveTextContent("React 19");
    expect(stack).toHaveTextContent("Gitea Actions");
  });

  it("points the primary links at their matching routes", () => {
    renderLanding();

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("link", { name: "Players" })).toHaveAttribute("href", "/players");
    expect(screen.getByRole("link", { name: "Teams" })).toHaveAttribute("href", "/teams");
  });

  it("offers all app destinations and the existing Google sign-in flow", () => {
    renderLanding();

    for (const label of ["Home", "Players", "Teams"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Get Started" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
  });

  it("signs logged-out visitors in before Get Started opens the app home", async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getByRole("button", { name: "Get Started" }));

    expect(signInWithGoogle).toHaveBeenCalledWith(`${window.location.origin}/home`);
  });

  it("returns landing-page Google sign-in to the app home", async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(signInWithGoogle).toHaveBeenCalledWith(`${window.location.origin}/home`);
  });

  it("links signed-in visitors straight to the app home", () => {
    vi.mocked(fetchGames).mockResolvedValue({ data: [], page: 1, pageSize: 1, total: 0 });
    vi.mocked(useSession).mockReturnValue(SIGNED_IN);

    renderWithProviders(<LandingPage />);

    expect(screen.getByRole("link", { name: "Get Started" })).toHaveAttribute("href", "/home");
  });

  it("reserves a box for each app screenshot that lands later", () => {
    renderLanding();

    expect(screen.getAllByTestId("screenshot-placeholder")).toHaveLength(5);
  });

  it("shares the full app header navigation on the landing page", () => {
    renderLanding();

    expect(screen.getByRole("link", { name: "Optimizer" })).toHaveAttribute("href", "/optimizer");
    expect(screen.getByRole("link", { name: "Predictions" })).toHaveAttribute("href", "/predictions");
  });
});
