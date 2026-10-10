import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PointsTrendChart } from "./PointsTrendChart";

// jsdom never gives ResponsiveContainer a size (no ResizeObserver layout),
// so the recharts internals never mount — which is fine here: the assertion
// is on the wrapper's accessible summary, and that renders regardless.
describe("PointsTrendChart screen-reader summary", () => {
  it("describes played-game trends with span, average and extremes", () => {
    render(
      <PointsTrendChart
        data={[
          { gameLabel: "G1", points: 20 },
          { gameLabel: "G2", points: 30 },
          { gameLabel: "G3", points: 22 },
        ]}
      />
    );

    expect(
      screen.getByRole("img", { name: "Points trend across 3 games, average 24.0, high 30.0, low 20.0" })
    ).toBeInTheDocument();
  });

  it("names a projection as projected", () => {
    render(<PointsTrendChart projected data={[{ gameLabel: "G1", points: 27.5, opponent: "BOS", isHome: false }]} />);

    expect(
      screen.getByRole("img", { name: "Projected points trend across 1 game, average 27.5, high 27.5, low 27.5" })
    ).toBeInTheDocument();
  });

  it("handles having no game data yet", () => {
    render(<PointsTrendChart data={[]} />);

    expect(screen.getByRole("img", { name: "Points trend: no game data yet" })).toBeInTheDocument();
  });
});
