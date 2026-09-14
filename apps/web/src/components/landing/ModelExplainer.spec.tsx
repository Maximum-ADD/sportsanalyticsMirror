import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModelExplainer } from "./ModelExplainer";
import { renderWithProviders } from "@/test/renderWithProviders";

describe("ModelExplainer", () => {
  it("introduces both models behind every prediction", () => {
    renderWithProviders(<ModelExplainer />);

    expect(screen.getByRole("heading", { level: 2, name: "How We Predict" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Win probability — Elo/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Predicted margin — Four Factors/ })).toBeInTheDocument();
    expect(screen.getByText("Effective shooting")).toBeInTheDocument();
    expect(screen.getByText("Turnover rate")).toBeInTheDocument();
    expect(screen.getByText("Free-throw rate")).toBeInTheDocument();
  });

  it("walks the worked example to the formula's real answer", async () => {
    renderWithProviders(<ModelExplainer />);

    // 1 / (1 + 10^(-(100 + 40) / 400)) ≈ 0.69 — the count-ups settle there.
    expect(await screen.findByText("69")).toBeInTheDocument();
    expect(await screen.findByText("31")).toBeInTheDocument();
  });

  it("labels both charts for screen readers", () => {
    renderWithProviders(<ModelExplainer />);

    expect(screen.getByRole("img", { name: /rating climbing after wins/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /win probability split/i })).toBeInTheDocument();
  });
});
