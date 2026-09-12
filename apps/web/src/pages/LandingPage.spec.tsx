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

  it("fills the NBA line with the basketball-leather texture", () => {
    const { container } = renderLanding();

    // Line one swaps its solid landing-accent fill for the macro ball
    // texture clipped into the glyphs (hero-leather-text); the outline
    // treatment on line two is untouched.
    const nbaLine = screen.getByRole("heading", { level: 1 }).querySelector("span.hero-leather-text");
    expect(nbaLine).toHaveTextContent("NBA");
    expect(container.querySelector("span.hero-outline-text")).not.toBeNull();
  });

  it("renders both section headings", () => {
    renderLanding();

    expect(screen.getByRole("heading", { level: 2, name: "What We Do" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /How We\s*Stand Out/ })).toBeInTheDocument();
  });

  it("explains the model in its own section", () => {
    renderLanding();

    expect(screen.getByRole("heading", { level: 2, name: "How We Predict" })).toBeInTheDocument();
  });

  it("separates What We Do from How We Predict with a thin rule", () => {
    renderLanding();

    const whatWeDo = screen.getByRole("heading", { name: "What We Do" }).closest("section");
    const howWePredict = screen.getByRole("heading", { name: "How We Predict" }).closest("section");
    const divider = whatWeDo?.nextElementSibling;

    expect(divider).toBe(howWePredict?.previousElementSibling);
    expect(divider).toHaveClass("border-t");
    expect(divider).toHaveAttribute("aria-hidden", "true");
  });

  it("lists the four key account points in a What-We-Do-style grid", () => {
    const { container } = renderLanding();

    const section = screen.getByRole("heading", { name: /How We\s*Stand Out/ }).closest("section");
    const items = Array.from(section?.querySelectorAll("li") ?? []);
    expect(items).toHaveLength(4);

    const pointNames = ["Personal dashboard", "Player watchlist", "Saved comparisons", "Lineup planning"];
    pointNames.forEach((name, index) => {
      expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
      expect(items[index]).toHaveTextContent(`0${index + 1}`);
      expect(items[index]).toHaveClass("border-t", "pt-5");
    });

    // Numbered text points only — no icon chips anywhere in the section.
    expect(section?.querySelectorAll("svg")).toHaveLength(0);
    expect(container.querySelectorAll("section.bg-landing-light")).toHaveLength(0);
  });

  it("returns the stand-out copy to a full-bleed photo with a protective scrim", () => {
    const { container } = renderLanding();

    const photo = container.querySelector<HTMLImageElement>('img[src*="clippers-arena"]');
    expect(photo).not.toBeNull();
    expect(photo).toHaveClass("object-cover");

    // Full-bleed again: the photo sits directly inside the section rather
    // than a framed panel, and a left-to-right scrim guards the copy zone.
    const section = photo?.closest("section");
    expect(photo?.parentElement?.parentElement).toBe(section);
    const scrim = section?.querySelector('div[aria-hidden="true"]');
    expect(scrim).toHaveClass("bg-linear-to-r");
  });

  it("outlines a faint, animated court over the hero photo", () => {
    const { container } = renderLanding();

    // The hero decoration: faint half-court lines with the brand-accent
    // comet lapping the boundary (see HeroCourtLines).
    expect(container.querySelectorAll(".hero-court-pulse")).toHaveLength(2);
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

    // The landing page shares the exact same header as every signed-in
    // page (see AppLayout/LandingHeader) — no reduced link set here.
    for (const label of ["Home", "Players", "Teams", "Optimizer", "Predictions"]) {
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

  it("does not render screenshot blocks on the landing page", () => {
    renderLanding();

    expect(screen.queryAllByTestId("screenshot-placeholder")).toHaveLength(0);
  });

});
