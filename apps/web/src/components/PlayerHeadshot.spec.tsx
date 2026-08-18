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

  it("falls back to initials when the headshot image fails to load", () => {
    render(<PlayerHeadshot player={PLAYER} />);
    const img = screen.getByRole("img", { name: "LeBron James" });

    fireEvent.error(img);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("LJ")).toBeInTheDocument();
  });
});
