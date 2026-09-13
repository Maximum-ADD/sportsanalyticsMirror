import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Marquee, type MarqueeItem } from "./Marquee";
import { renderWithProviders } from "@/test/renderWithProviders";

const ITEMS: MarqueeItem[] = [{ name: "Owen" }, { name: "Josh" }, { name: "Adrian" }];

describe("Marquee", () => {
  it("exposes each item exactly once, though the track holds two copies", () => {
    const { container } = renderWithProviders(<Marquee items={ITEMS} label="Development team" variant="symbiote" />);

    expect(container.querySelectorAll("li")).toHaveLength(ITEMS.length * 2 * 2);

    // Both the separator <li>s and the whole second track copy are
    // aria-hidden, so the a11y tree exposes each name exactly once.
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
      ITEMS.map((item) => item.name)
    );
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

  it("stacks a white chip above each name once any item carries a logo", () => {
    const { container } = renderWithProviders(
      <Marquee
        items={[
          { name: "React 19", logo: "/logos/react.webp" },
          { name: "Recharts" },
        ]}
        label="Our tech stack"
        variant="crystal"
      />
    );

    // Both track copies render the one logo; the logo-less stack gets no img.
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", "/logos/react.webp");
    // The name below the chip identifies the stack, so the image itself stays decorative.
    expect(images[0]).toHaveAttribute("alt", "");

    // Every name still reads, whether or not a logo sits above it.
    expect(screen.getAllByText("React 19")).toHaveLength(2);
    expect(screen.getAllByText("Recharts")).toHaveLength(2);
  });

  it("keeps name-only reels flat — no logo slots, no chips", () => {
    const { container } = renderWithProviders(
      <Marquee items={ITEMS} label="Development team" variant="symbiote" />
    );

    expect(container.querySelectorAll("img")).toHaveLength(0);
  });
});
