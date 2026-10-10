import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLeaderboard } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import { LeaderboardCard } from "./LeaderboardCard";

vi.mock("@/lib/nbaApi", () => ({ fetchLeaderboard: vi.fn() }));

const MODEL_ROW = { rank: 2, kind: "model" as const, name: "Elo model", calls: 231, correct: 148, hitRate: 0.641 };

describe("LeaderboardCard", () => {
  beforeEach(() => {
    vi.mocked(fetchLeaderboard).mockResolvedValue({
      minimumCallsRequired: 5,
      entries: [
        { rank: 1, kind: "user", name: "Sharp Caller", calls: 20, correct: 15, hitRate: 0.75 },
        MODEL_ROW,
        { rank: 3, kind: "user", name: "Cold Caller", calls: 12, correct: 4, hitRate: 0.3333 },
      ],
    });
  });

  it("ranks callers best first with the model among them", async () => {
    renderWithProviders(<LeaderboardCard />);

    const rows = await screen.findAllByRole("row");
    // Header row plus three entries.
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent("Sharp Caller");
    expect(rows[2]).toHaveTextContent("Elo model");
    expect(rows[3]).toHaveTextContent("Cold Caller");
  });

  it("renders a real table with column headers", async () => {
    renderWithProviders(<LeaderboardCard />);

    expect(await screen.findByRole("columnheader", { name: /caller/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /accuracy/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /calls/i })).toBeInTheDocument();
  });

  // The model has to be identifiable without relying on its row colour.
  it("labels the model as the benchmark in words", async () => {
    renderWithProviders(<LeaderboardCard />);

    expect(await screen.findByText(/benchmark/i)).toBeInTheDocument();
  });

  it("explains the qualification threshold", async () => {
    renderWithProviders(<LeaderboardCard />);

    expect(await screen.findByText(/minimum 5 calls to qualify/i)).toBeInTheDocument();
  });

  // Warning against over-reading the ranking: the denominators differ.
  it("says the model's row is not a like-for-like comparison", async () => {
    renderWithProviders(<LeaderboardCard />);

    expect(await screen.findByText(/every game it predicted, not just the ones you called/i)).toBeInTheDocument();
  });

  it("invites the user to play when only the model is on the board", async () => {
    vi.mocked(fetchLeaderboard).mockResolvedValue({
      minimumCallsRequired: 5,
      entries: [{ ...MODEL_ROW, rank: 1 }],
    });

    renderWithProviders(<LeaderboardCard />);

    expect(await screen.findByText(/nobody has qualified yet/i)).toBeInTheDocument();
    expect(screen.getByText(/make 5 calls/i)).toBeInTheDocument();
  });
});
