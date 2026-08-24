import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "./LandingPage";
import { fetchGames } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/lib/nbaApi", () => ({
  fetchGames: vi.fn(),
}));

vi.mock("@/lib/authClient", () => ({
  authClient: { signOut: vi.fn(), deleteUser: vi.fn() },
  signInWithGoogle: vi.fn(),
  useSession: vi.fn(() => ({ data: null, isPending: false })),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function renderLanding() {
  vi.mocked(fetchGames).mockResolvedValue({ data: [], page: 1, pageSize: 1, total: 0 });
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

    for (const label of ["Home", "Players", "Teams", "Get Started"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
  });

  it("reserves a box for each app screenshot that lands later", () => {
    renderLanding();

    expect(screen.getAllByTestId("screenshot-placeholder")).toHaveLength(5);
  });

  it("keeps feature-only destinations in the app header", () => {
    renderLanding();

    expect(screen.queryByRole("link", { name: "Optimizer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Predictions" })).not.toBeInTheDocument();
  });
});
