import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TeamBadge } from "./TeamBadge";

describe("TeamBadge", () => {
  it("renders an img pointing at the nba.com logo CDN when nbaTeamId is known", () => {
    render(<TeamBadge team={{ abbreviation: "LAL", nbaTeamId: 1610612747 }} />);
    const img = screen.getByRole("img", { name: "LAL logo" });
    expect(img).toHaveAttribute("src", "https://cdn.nba.com/logos/nba/1610612747/global/L/logo.svg");
  });

  it("falls back to the colored abbreviation badge when the logo image fails to load", () => {
    render(<TeamBadge team={{ abbreviation: "LAL", nbaTeamId: 1610612747 }} />);
    const img = screen.getByRole("img", { name: "LAL logo" });

    fireEvent.error(img);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("LAL")).toHaveStyle({ backgroundColor: "#552583" });
  });

  it("renders the abbreviation badge directly when no nbaTeamId is given", () => {
    render(<TeamBadge team={{ abbreviation: "LAL" }} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("LAL")).toBeInTheDocument();
  });

  it("uses the known Lakers brand color rather than a hashed fallback", () => {
    render(<TeamBadge team={{ abbreviation: "LAL" }} />);
    expect(screen.getByText("LAL")).toHaveStyle({ backgroundColor: "#552583" });
  });

  it("falls back to a deterministic hashed color for an unlisted team", () => {
    render(<TeamBadge team={{ abbreviation: "XYZ" }} />);
    const badge = screen.getByText("XYZ");
    const first = badge.style.backgroundColor;

    render(<TeamBadge team={{ abbreviation: "XYZ" }} />);
    const badges = screen.getAllByText("XYZ");
    expect(badges[1].style.backgroundColor).toBe(first);
  });

  it("applies the sm size class when requested", () => {
    render(<TeamBadge team={{ abbreviation: "BOS" }} size="sm" />);
    expect(screen.getByText("BOS").className).toContain("size-6");
  });
});
