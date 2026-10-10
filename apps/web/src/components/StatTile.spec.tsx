import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatTile } from "./StatTile";
import { expectNoAccessibilityViolations } from "@/test/accessibility";

describe("StatTile", () => {
  it("renders the label and a numeric value", () => {
    render(<StatTile label="Points" value={27.4} />);
    expect(screen.getByText("Points")).toBeInTheDocument();
    expect(screen.getByText("27.4")).toBeInTheDocument();
  });

  it("renders a string value as-is", () => {
    render(<StatTile label="Position" value="G-F" />);
    expect(screen.getByText("G-F")).toBeInTheDocument();
  });

  it("spells out an abbreviated label under the figure, always on screen", () => {
    // The explanation used to exist only in a one-time tutorial pop-up; it
    // has to be readable without opening anything.
    render(<StatTile label="RPG" value="7.3" />);
    expect(screen.getByText("Rebounds per game")).toBeVisible();
  });

  it("names the less obvious stats too", () => {
    render(
      <>
        <StatTile label="TS%" value="61.2%" />
        <StatTile label="USG%" value="31.0%" />
        <StatTile label="DRTG" value="108.4" />
      </>
    );
    expect(screen.getByText("True shooting %")).toBeInTheDocument();
    expect(screen.getByText("Usage rate")).toBeInTheDocument();
    expect(screen.getByText("Defensive rating")).toBeInTheDocument();
  });

  it("adds no caption to a label that is already a plain word", () => {
    const { container } = render(<StatTile label="Position" value="G-F" />);
    // The tile holds only its label and its value.
    expect(container.firstElementChild?.childElementCount).toBe(2);
  });

  it("lets the caller override the caption", () => {
    render(<StatTile label="PPG" value="21.0" caption="Points per game, level-adjusted" />);
    expect(screen.getByText("Points per game, level-adjusted")).toBeInTheDocument();
    expect(screen.queryByText("Points per game")).not.toBeInTheDocument();
  });

  it("keeps the caption while editing, beside an input still named by the label", () => {
    render(<StatTile label="PPG" value="21.0" isEditing editValue={21} onEditValueChange={() => {}} />);
    expect(screen.getByRole("spinbutton", { name: "Edit PPG" })).toBeInTheDocument();
    expect(screen.getByText("Points per game")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<StatTile label="AST:TO" value="2.41" />);
    await expectNoAccessibilityViolations(container);
  });
});
