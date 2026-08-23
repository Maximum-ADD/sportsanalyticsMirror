import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "./LandingPage";
import { fetchGames } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/lib/nbaApi", () => ({
  fetchGames: vi.fn(),
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

  it("points every link at the app home", () => {
    renderLanding();

    const links = screen
      .getAllByRole("link")
      .filter((link) => !link.getAttribute("href")?.startsWith("#"));
    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      expect(link).toHaveAttribute("href", "/home");
    }
  });

  it("offers all five nav destinations plus the hero call to action", () => {
    renderLanding();

    for (const label of ["Home", "Players", "Teams", "Register", "Login", "Get Started"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("reserves a box for each app screenshot that lands later", () => {
    renderLanding();

    expect(screen.getAllByTestId("screenshot-placeholder")).toHaveLength(5);
  });

  it("renders no app navbar — it is the public front door, not an app page", () => {
    renderLanding();

    expect(screen.queryByRole("link", { name: "Optimizer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Predictions" })).not.toBeInTheDocument();
  });
});
