import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatTile } from "./StatTile";

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
});
