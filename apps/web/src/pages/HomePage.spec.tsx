import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CHALLENGE } from "@/components/home/placeholderData";
import { renderWithProviders } from "@/test/renderWithProviders";
import { HomePage } from "./HomePage";

// No nbaApi mock here on purpose: /home is not wired to the API yet, so a
// query mock would be asserting on plumbing that does not exist. When it is
// wired up these become mocked-query tests like the other page specs.
describe("HomePage", () => {
  it("renders as an app page, not a second landing hero", () => {
    renderWithProviders(<HomePage />);

    // The bug this page exists to fix: LandingPage's CTA appeared to do
    // nothing because the old /home was a rebuild of its hero, right down to
    // a second button reading "Get Started". Nothing behind the app shell
    // should offer to start what the user already started.
    expect(screen.queryByText(/get started/i)).not.toBeInTheDocument();
    // It opens on a working module instead of a headline.
    expect(screen.getByText(/beat the model · call \d+ of your run/i)).toBeInTheDocument();
  });

  it("shows the personalized modules that require an account", () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByRole("heading", { name: /your watchlist · 9 players/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /your teams · thunder, nuggets/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /saved shelf/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /jump back in/i })).toBeInTheDocument();
    expect(screen.getByText("Shai Gilgeous-Alexander")).toBeInTheDocument();
  });

  it("withholds the final score until a call is made, then grades it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HomePage />);

    const finalScore = new RegExp(`${CHALLENGE.finalHomeScore}\\s*—\\s*${CHALLENGE.finalAwayScore}`);
    expect(screen.getByText(/result hidden/i)).toBeInTheDocument();
    expect(screen.queryByText(finalScore)).not.toBeInTheDocument();

    // Denver won 121-118, so calling Denver is correct.
    await user.click(screen.getByRole("button", { name: CHALLENGE.homeCity }));

    expect(screen.getByText(finalScore)).toBeInTheDocument();
    expect(screen.getByText("Correct")).toBeInTheDocument();
    expect(screen.getByText(/you called denver/i)).toBeInTheDocument();
  });

  it("marks a wrong call as missed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HomePage />);

    await user.click(screen.getByRole("button", { name: CHALLENGE.awayCity }));

    expect(screen.getByText("Missed")).toBeInTheDocument();
    expect(screen.getByText(/you called oklahoma city/i)).toBeInTheDocument();
  });

  it("reports that the model missed this game whichever side you called", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HomePage />);

    // The placeholder game is one the Elo model got wrong (it favoured the
    // away side at 64% and the home side won), so both calls report a model
    // miss. BeatTheModelCard.spec covers the model-was-right branch.
    await user.click(screen.getByRole("button", { name: CHALLENGE.homeCity }));

    expect(screen.getByText(/the model missed this one/i)).toBeInTheDocument();
  });

  it("returns to a hidden result on the next call", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HomePage />);

    await user.click(screen.getByRole("button", { name: CHALLENGE.homeCity }));
    await user.click(screen.getByRole("button", { name: /next call/i }));

    expect(screen.getByText(/result hidden/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CHALLENGE.homeCity })).toBeInTheDocument();
  });

  it("publishes the model's accuracy with the baseline that makes it mean something", () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByText("61.3%")).toBeInTheDocument();
    expect(screen.getByText(/baseline · always home/i)).toBeInTheDocument();
    expect(screen.getByText("55.2%")).toBeInTheDocument();
    // Saying this out loud beats marketing a backtest as a track record.
    expect(screen.getByText(/0 forward predictions so far/i)).toBeInTheDocument();
  });

  it("flags a calibration bucket too thin to read as fact", () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByText(/21 · n too small/i)).toBeInTheDocument();
  });
});
