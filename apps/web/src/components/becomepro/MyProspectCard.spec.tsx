import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { makeProspectRankSummary } from "@/test/becomeProFixtures";
import { fetchMyProspectRank } from "@/lib/becomeProApi";
import { useSession } from "@/lib/authClient";
import { MyProspectCard } from "./MyProspectCard";

vi.mock("@/lib/authClient", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/becomeProApi", () => ({
  PROSPECT_RANK_QUERY_KEY: ["prospectRank"],
  fetchMyProspectRank: vi.fn(),
}));

function signIn() {
  vi.mocked(useSession).mockReturnValue({
    data: { user: { name: "Kiran" } },
    isPending: false,
  } as never);
}

describe("MyProspectCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn();
    vi.mocked(fetchMyProspectRank).mockResolvedValue(makeProspectRankSummary());
  });

  it("shows the projected value and rank", async () => {
    renderWithProviders(<MyProspectCard />);

    expect(await screen.findByText("$4.37M")).toBeInTheDocument();
    expect(screen.getByLabelText("Rank 12 on the Become Pro board")).toBeInTheDocument();
  });

  it("labels the figure as self-reported", async () => {
    renderWithProviders(<MyProspectCard />);

    expect(await screen.findByText(/projection · self-reported/i)).toBeInTheDocument();
  });

  it("links to the user's own season", async () => {
    renderWithProviders(<MyProspectCard />);

    expect(await screen.findByRole("link", { name: /my season/i })).toHaveAttribute(
      "href",
      "/become-pro/kiran"
    );
  });

  it("plots the value history when there is more than one valuation", async () => {
    renderWithProviders(<MyProspectCard />);

    expect(
      await screen.findByLabelText(/projected value across the last 2 valuations/i)
    ).toBeInTheDocument();
  });

  // One valuation is a dot, not a trend — drawing a line through it would
  // imply movement that has not happened yet.
  it("draws no sparkline from a single valuation", async () => {
    vi.mocked(fetchMyProspectRank).mockResolvedValue(
      makeProspectRankSummary({
        valueHistory: [{ computedAt: "2026-02-01T12:00:00.000Z", valueUsd: 4_368_000 }],
      })
    );

    renderWithProviders(<MyProspectCard />);
    await screen.findByText("$4.37M");

    expect(screen.queryByLabelText(/projected value across/i)).not.toBeInTheDocument();
  });

  describe("below the games floor", () => {
    beforeEach(() => {
      vi.mocked(fetchMyProspectRank).mockResolvedValue(
        makeProspectRankSummary({
          rank: null,
          rankState: "BELOW_GAMES_FLOOR",
          projectedValueUsd: null,
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

    it("invites the user to keep logging", async () => {
      renderWithProviders(<MyProspectCard />);

      expect(await screen.findByText(/3 more games needed/i)).toBeInTheDocument();
    });
  });

  it("prompts a brand-new account to start a season", async () => {
    vi.mocked(fetchMyProspectRank).mockResolvedValue(
      makeProspectRankSummary({
        rank: null,
        rankState: "BELOW_GAMES_FLOOR",
        projectedValueUsd: null,
        gamesLogged: 0,
        username: null,
        valueHistory: [],
      })
    );

    renderWithProviders(<MyProspectCard />);

    expect(await screen.findByRole("link", { name: /start a season/i })).toHaveAttribute(
      "href",
      "/become-pro"
    );
  });

  it("recovers from a failed load", async () => {
    vi.mocked(fetchMyProspectRank).mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();

    renderWithProviders(<MyProspectCard />);
    await user.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByText("$4.37M")).toBeInTheDocument();
  });

  // /home is already behind a session gate, so an invitation here would be
  // copy nobody signed out can reach.
  it("renders nothing when signed out", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);

    const { container } = renderWithProviders(<MyProspectCard />);

    expect(container).toBeEmptyDOMElement();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithProviders(<MyProspectCard />);
    await screen.findByText("$4.37M");

    await expectNoAccessibilityViolations(container);
  });
});
