import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { fetchTeamInjuries, type PlayerInjury } from "@/lib/injuriesApi";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { renderWithProviders } from "@/test/renderWithProviders";
import { TeamInjuriesSection } from "./TeamInjuriesSection";

vi.mock("@/lib/injuriesApi", () => ({
  fetchTeamInjuries: vi.fn(),
}));

const SHARPE: PlayerInjury = {
  playerName: "Shaedon Sharpe",
  playerId: "player-sharpe",
  status: "Out",
  severity: "OUT",
  bodyPart: "Leg",
  side: "Right",
  detail: "Stress fracture",
  expectedReturn: "2027-03-02",
  note: "Sharpe will be re-evaluated in six weeks.",
  updatedAt: "2026-10-08T21:00:00.000Z",
};

const ROOKIE: PlayerInjury = {
  ...SHARPE,
  playerName: "Rookie Unknown",
  playerId: null,
  status: "Day-To-Day",
  severity: "DAY_TO_DAY",
  bodyPart: "Ankle",
  side: null,
  detail: "Sprain",
  expectedReturn: "2026-10-12",
  note: null,
};

describe("TeamInjuriesSection", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists each injured player with status, injury, expected return and ESPN's credit", async () => {
    vi.mocked(fetchTeamInjuries).mockResolvedValue({ fetchedAt: "2026-10-09T18:00:00.000Z", injuries: [SHARPE, ROOKIE] });

    const { container } = renderWithProviders(<TeamInjuriesSection teamId="team-blazers" />);

    const [sharpeRow, rookieRow] = await screen.findAllByRole("listitem");
    const section = screen.getByRole("region", { name: "Injuries" });
    expect(within(sharpeRow).getByRole("link", { name: "Shaedon Sharpe" })).toHaveAttribute("href", "/players/player-sharpe");
    expect(within(sharpeRow).getByText("Out")).toBeInTheDocument();
    expect(within(sharpeRow).getByText("Right leg · Stress fracture")).toBeInTheDocument();
    expect(within(sharpeRow).getByText("Expected return 2 Mar 2027 (ESPN estimate)")).toBeInTheDocument();
    expect(within(sharpeRow).getByText("Updated 8 Oct 2026")).toBeInTheDocument();
    expect(within(section).getByText("Injury data: ESPN")).toBeInTheDocument();
    await expectNoAccessibilityViolations(container);

    // A player the app doesn't hold is listed, just without a link.
    expect(within(rookieRow).getByText("Rookie Unknown")).toBeInTheDocument();
    expect(within(rookieRow).queryByRole("link")).not.toBeInTheDocument();
    expect(within(rookieRow).getByText("Day-to-day")).toBeInTheDocument();
  });

  it("says so when the team has no injuries", async () => {
    vi.mocked(fetchTeamInjuries).mockResolvedValue({ fetchedAt: "2026-10-09T18:00:00.000Z", injuries: [] });

    renderWithProviders(<TeamInjuriesSection teamId="team-celtics" />);

    expect(await screen.findByText("No injuries reported.")).toBeInTheDocument();
  });

  it("says the report is unavailable when ESPN can't be read, without failing the page", async () => {
    vi.mocked(fetchTeamInjuries).mockRejectedValue(new ApiError("Injury data is unavailable right now.", 503));

    renderWithProviders(<TeamInjuriesSection teamId="team-blazers" />);

    expect(await screen.findByText("The injury report is unavailable right now.")).toBeInTheDocument();
  });
});
