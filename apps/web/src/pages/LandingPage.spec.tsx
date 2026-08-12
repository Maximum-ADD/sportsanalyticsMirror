import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingPage } from "./LandingPage";
import { renderWithProviders } from "@/test/renderWithProviders";

describe("LandingPage", () => {
  it("sends the Get Started CTA to the dashboard", () => {
    renderWithProviders(<LandingPage />);

    expect(screen.getByRole("link", { name: /Get Started/ })).toHaveAttribute("href", "/home");
  });

  it("exposes the main region that the skip link targets", () => {
    renderWithProviders(<LandingPage />);

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveAttribute("tabindex", "-1");
  });

  // Guards that the design's rasterised text layers stayed as real DOM text.
  it("renders the headline as real text rather than images", () => {
    renderWithProviders(<LandingPage />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Sports");
    expect(heading).toHaveTextContent("Analytics");
    expect(heading).toHaveTextContent("Platform");
  });

  it("renders the hero photograph as decorative", () => {
    const { container } = renderWithProviders(<LandingPage />);

    const heroImage = container.querySelector("picture img");
    expect(heroImage).toHaveAttribute("alt", "");
    expect(heroImage).toHaveAttribute("width", "1920");
    expect(heroImage).toHaveAttribute("height", "1083");
  });
});
