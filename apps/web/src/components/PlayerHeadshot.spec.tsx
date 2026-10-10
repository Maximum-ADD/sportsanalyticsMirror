import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerHeadshot } from "./PlayerHeadshot";

const PLAYER = { nbaPlayerId: 2544, firstName: "LeBron", lastName: "James" };

describe("PlayerHeadshot", () => {
  it("renders an img pointing at the nba.com headshot CDN for this player's id", () => {
    render(<PlayerHeadshot player={PLAYER} />);
    const img = screen.getByRole("img", { name: "LeBron James" });
    expect(img).toHaveAttribute("src", "https://cdn.nba.com/headshots/nba/latest/1040x760/2544.png");
  });

  // F21: the main photos (the profile hero, Compare, the top-scorer cards)
  // were too small on a desktop. They step up at the wider breakpoints; the
  // compact sizes used in dense lists do not move.
  it("steps the main photo size up at the desktop breakpoints", () => {
    render(<PlayerHeadshot player={PLAYER} size="lg" />);

    expect(screen.getByRole("img")).toHaveClass("size-20", "md:size-24", "lg:size-28");
  });

  it("keeps the compact size fixed for dense lists", () => {
    render(<PlayerHeadshot player={PLAYER} size="sm" />);

    expect(screen.getByRole("img")).toHaveClass("size-10");
    expect(screen.getByRole("img")).not.toHaveClass("md:size-24");
  });

  it("falls back to initials when the headshot image fails to load", () => {
    render(<PlayerHeadshot player={PLAYER} />);
    const img = screen.getByRole("img", { name: "LeBron James" });

    fireEvent.error(img);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("LJ")).toBeInTheDocument();
  });
});
