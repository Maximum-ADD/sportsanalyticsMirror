import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import {
  makeProspectLeaderboard,
  makeProspectLeaderboardEntry,
} from "@/test/becomeProFixtures";
import { fetchProspectLeaderboard } from "@/lib/becomeProApi";
import { ProspectLeaderboard } from "./ProspectLeaderboard";

vi.mock("@/lib/becomeProApi", () => ({
  PROSPECT_LEADERBOARD_QUERY_KEY: ["prospectLeaderboard"],
  fetchProspectLeaderboard: vi.fn(),
}));

const TOP = makeProspectLeaderboardEntry({
  rank: 1,
  username: "kiran",
  displayName: "Kiran",
  projectedValueUsd: 4_368_000,
});
const SECOND = makeProspectLeaderboardEntry({
  rank: 2,
  username: "sam",
  displayName: "Sam",
  projectedValueUsd: 2_100_000,
  gamesLogged: 11,
});

describe("ProspectLeaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchProspectLeaderboard).mockResolvedValue(
      makeProspectLeaderboard({ data: [TOP, SECOND], total: 2 })
    );
  });

  it("ranks prospects by value, best first", async () => {
    renderWithProviders(<ProspectLeaderboard />);

    const rows = await screen.findAllByRole("row");
    // Header, two prospects, then the two rookie-scale reference rows.
    expect(rows).toHaveLength(5);
    expect(rows[1]).toHaveTextContent("Kiran");
    expect(rows[2]).toHaveTextContent("Sam");
  });

  it("renders a real table with column headers", async () => {
    renderWithProviders(<ProspectLeaderboard />);

    expect(await screen.findByRole("columnheader", { name: /prospect/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /value/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /games/i })).toBeInTheDocument();
  });

  it("links each prospect to their own page", async () => {
    renderWithProviders(<ProspectLeaderboard />);

    expect(await screen.findByRole("link", { name: "Kiran" })).toHaveAttribute(
      "href",
      "/become-pro/kiran"
    );
  });

  // Your own row has to be findable in greyscale and to a screen reader, so
  // the word carries it rather than the background colour.
  it("marks your own row in words", async () => {
    vi.mocked(fetchProspectLeaderboard).mockResolvedValue(
      makeProspectLeaderboard({
        data: [{ ...TOP, isSelf: true }, SECOND],
        total: 2,
      })
    );

    renderWithProviders(<ProspectLeaderboard />);

    expect(await screen.findByText(/^you$/i)).toBeInTheDocument();
  });

  it("pins your standing onto the table when it is off this page", async () => {
    vi.mocked(fetchProspectLeaderboard).mockResolvedValue(
      makeProspectLeaderboard({
        data: [TOP, SECOND],
        total: 40,
        yourStanding: makeProspectLeaderboardEntry({
          rank: 31,
          username: "late",
          displayName: "Late Bloomer",
          isSelf: true,
        }),
      })
    );

    renderWithProviders(<ProspectLeaderboard />);

    expect(await screen.findByText("Late Bloomer")).toBeInTheDocument();
  });

  it("does not repeat your standing when it is already on the page", async () => {
    vi.mocked(fetchProspectLeaderboard).mockResolvedValue(
      makeProspectLeaderboard({
        data: [{ ...TOP, isSelf: true }, SECOND],
        total: 2,
        yourStanding: { ...TOP, isSelf: true },
      })
    );

    renderWithProviders(<ProspectLeaderboard />);
    await screen.findByText("Sam");

    expect(screen.getAllByText("Kiran")).toHaveLength(1);
  });

  // The rookie-scale rows are the yardstick, not competitors — they must be
  // identifiable as such without relying on their colour.
  it("labels the rookie-scale anchors as reference rows in words", async () => {
    renderWithProviders(<ProspectLeaderboard />);

    expect(await screen.findByText("Pick 1")).toBeInTheDocument();
    expect(screen.getAllByText(/^reference$/i)).toHaveLength(2);
  });

  it("explains the qualification floor", async () => {
    renderWithProviders(<ProspectLeaderboard />);

    expect(await screen.findByText(/minimum 10 logged games to qualify/i)).toBeInTheDocument();
  });

  it("says the Pick rows are a scale rather than players", async () => {
    renderWithProviders(<ProspectLeaderboard />);

    expect(await screen.findByText(/the Pick rows are that scale, not players/i)).toBeInTheDocument();
  });

  it("explains how ties are ranked", async () => {
    renderWithProviders(<ProspectLeaderboard />);

    expect(await screen.findByText(/share a rank/i)).toBeInTheDocument();
  });

  it("invites the first prospect when nobody has qualified", async () => {
    vi.mocked(fetchProspectLeaderboard).mockResolvedValue(
      makeProspectLeaderboard({ data: [], total: 0 })
    );

    renderWithProviders(<ProspectLeaderboard />);

    expect(await screen.findByText(/nobody has qualified yet/i)).toBeInTheDocument();
  });

  it("recovers from a failed load", async () => {
    vi.mocked(fetchProspectLeaderboard).mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();

    renderWithProviders(<ProspectLeaderboard />);
    await user.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Kiran")).toBeInTheDocument();
  });

  describe("compact variant", () => {
    it("hides the search box and the pager", async () => {
      renderWithProviders(<ProspectLeaderboard compact limit={5} />);
      await screen.findByText("Kiran");

      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    });

    it("requests only the rows it will show", async () => {
      renderWithProviders(<ProspectLeaderboard compact limit={5} />);
      await screen.findByText("Kiran");

      expect(vi.mocked(fetchProspectLeaderboard).mock.calls[0]?.[0]).toMatchObject({
        page: 1,
        pageSize: 5,
      });
    });
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithProviders(<ProspectLeaderboard />);
    await screen.findByText("Kiran");

    await expectNoAccessibilityViolations(container);
  });
});
