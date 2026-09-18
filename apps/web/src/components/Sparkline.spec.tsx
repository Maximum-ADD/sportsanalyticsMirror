import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("exposes the plotted series as an accessible image name", () => {
    render(<Sparkline points={[10, 24, 18, 31]} label="Points across the last 4 games" />);

    const graphic = screen.getByRole("img", { name: "Points across the last 4 games" });
    expect(graphic.querySelector("polyline")).not.toBeNull();
  });

  it("falls back to a flat placeholder when fewer than two values are plotted", () => {
    render(<Sparkline points={[7]} label="Points across one game" />);

    const graphic = screen.getByRole("img", { name: "Points across one game" });
    expect(graphic.querySelector("polyline")).toBeNull();
    expect(graphic.querySelector("line")).not.toBeNull();
  });

  it("handles an all-zero series without producing invalid coordinates", () => {
    render(<Sparkline points={[0, 0, 0]} label="Points across the last 3 games" />);

    const polyline = screen
      .getByRole("img", { name: "Points across the last 3 games" })
      .querySelector("polyline");
    expect(polyline).not.toBeNull();
    expect(polyline?.getAttribute("points")).not.toContain("NaN");
  });
});
