import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlayerTraitsRadar } from "./PlayerTraitsRadar";
import type { SeasonAverages } from "@/types/nba";

// The real ResponsiveContainer measures its parent through ResizeObserver,
// which never fires in jsdom, so the chart never mounts. Fixed pixel
// dimensions make it provision its size context synchronously — the chart
// (and its clickable trait labels) renders for real.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const RealResponsiveContainer = actual.ResponsiveContainer;
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <RealResponsiveContainer width={480} height={240}>
        {children}
      </RealResponsiveContainer>
    ),
  };
});

function makeAverages(overrides: Partial<SeasonAverages> = {}): SeasonAverages {
  return {
    gamesPlayed: 62,
    minutesPerGame: 34.5,
    pointsPerGame: 27.1,
    reboundsPerGame: 7.4,
    assistsPerGame: 8.2,
    stealsPerGame: 1.3,
    blocksPerGame: 0.6,
    turnoversPerGame: 3.1,
    fieldGoalsMadePerGame: 9.9,
    fieldGoalsAttemptedPerGame: 19,
    fieldGoalPercentage: 52,
    threesMadePerGame: 2.1,
    threesAttemptedPerGame: 5.5,
    threePointPercentage: 38,
    freeThrowsMadePerGame: 5.4,
    freeThrowsAttemptedPerGame: 7.2,
    freeThrowPercentage: 75,
    trueShootingPercentage: 61.5,
    effectiveFieldGoalPercentage: 55.9,
    assistToTurnoverRatio: 2.65,
    plusMinusPerGame: 6.4,
    usagePercentage: 31.2,
    offensiveRating: 118,
    defensiveRating: 109,
    ...overrides,
  };
}

describe("PlayerTraitsRadar", () => {
  it("renders every trait as a selectable axis label", () => {
    render(<PlayerTraitsRadar seasonAverages={makeAverages()} />);

    for (const traitName of ["Scoring", "Rebounding", "Playmaking", "Defense", "Efficiency"]) {
      expect(screen.getByRole("button", { name: traitName })).toBeInTheDocument();
    }
  });

  it("shows the selected trait's raw figures, defaulting to Scoring", () => {
    render(<PlayerTraitsRadar seasonAverages={makeAverages()} />);

    expect(screen.getByText("Scoring · this segment")).toBeInTheDocument();
    expect(screen.getByText("27.1")).toBeInTheDocument(); // PTS/G
    expect(screen.getByText("19.0")).toBeInTheDocument(); // FGA/G
    // Each figure carries a plain-terms gloss, not just the jargon label.
    expect(screen.getByText(/Points per game/)).toBeInTheDocument();
    expect(screen.getByText(/how many shots they take/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scoring" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches the panel to the clicked trait's stats", async () => {
    const user = userEvent.setup();
    render(<PlayerTraitsRadar seasonAverages={makeAverages()} />);

    await user.click(screen.getByRole("button", { name: "Efficiency" }));

    expect(screen.getByText("Efficiency · this segment")).toBeInTheDocument();
    expect(screen.getByText("52.0%")).toBeInTheDocument(); // FG%
    expect(screen.getByText("61.5%")).toBeInTheDocument(); // TS%
    expect(screen.getByRole("button", { name: "Efficiency" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Scoring" })).toHaveAttribute("aria-pressed", "false");
  });

  it("selects a trait from the keyboard like a click does", async () => {
    const user = userEvent.setup();
    render(<PlayerTraitsRadar seasonAverages={makeAverages()} />);

    screen.getByRole("button", { name: "Defense" }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByText("Defense · this segment")).toBeInTheDocument();
    expect(screen.getByText("1.9")).toBeInTheDocument(); // STL+BLK/G
  });

  it("renders an unrecorded figure as a dash rather than zero", async () => {
    const user = userEvent.setup();
    render(<PlayerTraitsRadar seasonAverages={makeAverages({ assistToTurnoverRatio: null })} />);

    await user.click(screen.getByRole("button", { name: "Playmaking" }));

    // Playmaking's AST:TO line has no recorded value — a zero there would
    // claim a measured ratio, so the panel shows the no-value dash. The
    // value sits in the span right beside the label.
    const astToLabel = screen.getByText("AST:TO");
    expect(astToLabel.nextElementSibling!.textContent).toBe("—");
    // …and the line still explains what the abbreviation would mean.
    expect(astToLabel.parentElement!.nextElementSibling!.textContent).toMatch(/Assist-to-turnover ratio/);
  });
});
