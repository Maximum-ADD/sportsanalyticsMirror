import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveMatchCard } from "./LiveMatchCard";
import type { LiveMatchSummary } from "./LiveMatchCard";

describe("LiveMatchCard", () => {
  it("renders the placeholder scoreboard by default", () => {
    render(<LiveMatchCard />);

    expect(screen.getByText("Live match updates")).toBeInTheDocument();
    expect(screen.getByText("LAL")).toBeInTheDocument();
    expect(screen.getByText("38")).toBeInTheDocument();
    expect(screen.getByText("BOS")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
  });

  it("renders a supplied match instead of the placeholder", () => {
    const match: LiveMatchSummary = {
      away: { abbreviation: "GSW", score: 77 },
      home: { abbreviation: "MIL", score: 81 },
    };

    render(<LiveMatchCard match={match} />);

    expect(screen.getByText("GSW")).toBeInTheDocument();
    expect(screen.getByText("81")).toBeInTheDocument();
    expect(screen.queryByText("LAL")).not.toBeInTheDocument();
  });

  it("exposes a group labelled by its visible caption", () => {
    render(<LiveMatchCard />);

    expect(screen.getByRole("group", { name: "Live match updates" })).toBeInTheDocument();
  });

  it("gives assistive tech one readable score line instead of the visual layout", () => {
    render(<LiveMatchCard />);

    expect(screen.getByText("BOS 24, LAL 38").className).toContain("sr-only");
  });

  it("stops the live dot pulsing under prefers-reduced-motion", () => {
    const { container } = render(<LiveMatchCard />);

    const dot = container.querySelector('[data-slot="live-match-dot"]');
    expect(dot).toHaveAttribute("aria-hidden");
    expect(dot?.className).toContain("motion-safe:animate-pulse");
  });

  // Deliberate: a live region over static content promises updates that never
  // arrive. A real feed would put role="status" on the sr-only sentence.
  it("announces nothing while the scores are static placeholders", () => {
    const { container } = render(<LiveMatchCard />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });
});
