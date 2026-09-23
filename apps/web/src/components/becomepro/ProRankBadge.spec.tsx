import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { ProRankBadge } from "./ProRankBadge";

describe("ProRankBadge", () => {
  it("shows the rank with a hash", () => {
    renderWithProviders(<ProRankBadge rank={12} />);

    expect(screen.getByText("#12")).toBeInTheDocument();
  });

  // The number alone is glanceable but meaningless out of context, so the
  // accessible name has to say what it is a rank of.
  it("names what the number is a rank of", () => {
    renderWithProviders(<ProRankBadge rank={12} />);

    expect(screen.getByLabelText("Rank 12 on the Become Pro board")).toBeInTheDocument();
  });

  // Absence renders nothing at all rather than "#—" or "#0": one reads as a
  // broken figure, the other as a real and very bad one.
  it("renders nothing when there is no rank", () => {
    const { container } = renderWithProviders(<ProRankBadge rank={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("takes its tone from the caller so it works on dark and light surfaces", () => {
    renderWithProviders(<ProRankBadge rank={3} className="text-brand-accent" />);

    expect(screen.getByText("#3")).toHaveClass("text-brand-accent");
  });
});
