import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Marquee } from "./Marquee";
import { renderWithProviders } from "@/test/renderWithProviders";

const ITEMS = ["Owen", "Josh", "Adrian"];

describe("Marquee", () => {
  it("exposes each item exactly once, though the track holds two copies", () => {
    const { container } = renderWithProviders(<Marquee items={ITEMS} label="Development team" variant="symbiote" />);

    expect(container.querySelectorAll("li")).toHaveLength(ITEMS.length * 2 * 2);

    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(ITEMS);
  });

  it("labels the reel so it is navigable as a landmark", () => {
    renderWithProviders(<Marquee items={ITEMS} label="Development team" variant="symbiote" />);

    expect(screen.getByRole("region", { name: "Development team" })).toBeInTheDocument();
  });

  it("gives each reel its own material", () => {
    const symbiote = renderWithProviders(
      <Marquee items={ITEMS} label="Development team" variant="symbiote" />
    );
    expect(symbiote.container.querySelector(".reel-symbiote")).toBeInTheDocument();
    expect(symbiote.container.querySelector(".reel-crystal")).not.toBeInTheDocument();

    const crystal = renderWithProviders(
      <Marquee items={ITEMS} label="Our tech stack" variant="crystal" />
    );
    expect(crystal.container.querySelector(".reel-crystal")).toBeInTheDocument();
    expect(crystal.container.querySelector(".reel-symbiote")).not.toBeInTheDocument();
  });
});
