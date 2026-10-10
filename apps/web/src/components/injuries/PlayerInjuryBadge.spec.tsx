import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { fetchPlayerInjury } from "@/lib/injuriesApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import { PlayerInjuryBadge } from "./PlayerInjuryBadge";

vi.mock("@/lib/injuriesApi", () => ({
  fetchPlayerInjury: vi.fn(),
}));

const FETCHED_AT = "2026-10-09T18:00:00.000Z";

describe("PlayerInjuryBadge", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows an injured player's status, injury and expected return", async () => {
    vi.mocked(fetchPlayerInjury).mockResolvedValue({
      fetchedAt: FETCHED_AT,
      injury: {
        playerName: "Keshon Gilbert",
        playerId: "player-gilbert",
        status: "Day-To-Day",
        severity: "DAY_TO_DAY",
        bodyPart: "Knee",
        side: "Left",
        detail: "Tendinitis",
        expectedReturn: "2026-10-10",
        note: null,
        updatedAt: FETCHED_AT,
      },
    });

    renderWithProviders(<PlayerInjuryBadge playerId="player-gilbert" />);

    const badge = await screen.findByRole("group", { name: "Injury status" });
    expect(badge).toHaveTextContent("Day-to-day");
    expect(badge).toHaveTextContent("Left knee · Tendinitis");
    expect(badge).toHaveTextContent("Expected return 10 Oct 2026 (ESPN estimate)");
  });

  it("shows nothing for a player who isn't on the report", async () => {
    vi.mocked(fetchPlayerInjury).mockResolvedValue({ fetchedAt: FETCHED_AT, injury: null });

    renderWithProviders(<PlayerInjuryBadge playerId="player-healthy" />);

    await waitFor(() => expect(fetchPlayerInjury).toHaveBeenCalled());
    expect(screen.queryByRole("group", { name: "Injury status" })).not.toBeInTheDocument();
  });

  it("shows nothing, rather than an error, when the report is unavailable", async () => {
    vi.mocked(fetchPlayerInjury).mockRejectedValue(new ApiError("Injury data is unavailable right now.", 503));

    const { container } = renderWithProviders(<PlayerInjuryBadge playerId="player-1" />);

    await waitFor(() => expect(fetchPlayerInjury).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
