import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { makeMyBecomeProSummary } from "@/test/becomeProFixtures";
import { fetchMyBecomeProSummary } from "@/lib/becomeProApi";
import { useSession } from "@/lib/authClient";
import { MyProspectCard } from "./MyProspectCard";

vi.mock("@/lib/authClient", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/becomeProApi", () => ({
  MY_BECOME_PRO_SUMMARY_QUERY_KEY: ["myBecomeProSummary"],
  fetchMyBecomeProSummary: vi.fn(),
}));

function signIn() {
  vi.mocked(useSession).mockReturnValue({ data: { user: { name: "Kiran" } }, isPending: false } as never);
}

describe("MyProspectCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn();
    vi.mocked(fetchMyBecomeProSummary).mockResolvedValue(makeMyBecomeProSummary());
  });

  it("shows the projected value and pick", async () => {
    renderWithProviders(<MyProspectCard />);

    expect(await screen.findByText("$3.52M")).toBeInTheDocument();
    expect(screen.getByText("Pick 18")).toBeInTheDocument();
  });

  it("labels the figure as self-reported", async () => {
    renderWithProviders(<MyProspectCard />);

    expect(await screen.findByText(/projection · self-reported · 14 games/i)).toBeInTheDocument();
  });

  it("names the season and level it describes", async () => {
    renderWithProviders(<MyProspectCard />);

    expect(await screen.findByText(/2025-26 · NCAA Division II/)).toBeInTheDocument();
  });

  it("links to the Become Pro page", async () => {
    renderWithProviders(<MyProspectCard />);

    expect(await screen.findByRole("link", { name: /my season/i })).toHaveAttribute("href", "/become-pro");
  });

  it("plots the value history when there is more than one valuation", async () => {
    renderWithProviders(<MyProspectCard />);

    expect(await screen.findByLabelText(/projected value across your last 2 valuations/i)).toBeInTheDocument();
  });

  // One valuation is a dot, not a trend.
  it("draws no sparkline from a single valuation", async () => {
    vi.mocked(fetchMyBecomeProSummary).mockResolvedValue(
      makeMyBecomeProSummary({ valueHistory: [{ computedAt: "2026-02-01T12:00:00.000Z", valueUsd: 3_520_000 }] })
    );

    renderWithProviders(<MyProspectCard />);
    await screen.findByText("$3.52M");

    expect(screen.queryByLabelText(/projected value across/i)).not.toBeInTheDocument();
  });

  describe("below the games floor", () => {
    beforeEach(() => {
      vi.mocked(fetchMyBecomeProSummary).mockResolvedValue(
        makeMyBecomeProSummary({
          valuationState: "BELOW_GAMES_FLOOR",
          projectedValueUsd: null,
          projectedDraftSlot: null,
          gamesLogged: 7,
          valueHistory: [],
        })
      );
    });

    it("shows no figure at all", async () => {
      renderWithProviders(<MyProspectCard />);
      await screen.findByText(/3 more games needed/i);

      expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    });

    it("points the user at logging more games", async () => {
      renderWithProviders(<MyProspectCard />);

      expect(await screen.findByRole("link", { name: /log games/i })).toHaveAttribute("href", "/become-pro");
    });
  });

  it("invites a user who has not started a season", async () => {
    vi.mocked(fetchMyBecomeProSummary).mockResolvedValue(
      makeMyBecomeProSummary({
        season: null,
        competitionLevel: null,
        gamesLogged: 0,
        valuationState: null,
        projectedValueUsd: null,
        projectedDraftSlot: null,
        valueHistory: [],
      })
    );

    renderWithProviders(<MyProspectCard />);

    expect(await screen.findByRole("link", { name: /start a season/i })).toHaveAttribute("href", "/become-pro");
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("recovers from a failed load", async () => {
    vi.mocked(fetchMyBecomeProSummary).mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();

    renderWithProviders(<MyProspectCard />);
    await user.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByText("$3.52M")).toBeInTheDocument();
  });

  it("renders nothing when signed out", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);

    const { container } = renderWithProviders(<MyProspectCard />);

    expect(container).toBeEmptyDOMElement();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithProviders(<MyProspectCard />);
    await screen.findByText("$3.52M");

    await expectNoAccessibilityViolations(container);
  });
});
