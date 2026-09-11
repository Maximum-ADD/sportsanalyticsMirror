import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { BeatTheModelCard } from "./BeatTheModelCard";
import { CHALLENGE, type ModelChallenge } from "./placeholderData";

// A game the Elo model called correctly: it favoured the home side at 68%
// and the home side won. The shipped placeholder game is the opposite case,
// so this fixture is what exercises the "model had it too" copy path.
const MODEL_WAS_RIGHT: ModelChallenge = {
  ...CHALLENGE,
  gameId: "0022500777",
  homeWinProbability: 0.68,
  homeTeamEloPre: 1620,
  awayTeamEloPre: 1540,
  predictedMarginHome: 6.2,
  finalHomeScore: 118,
  finalAwayScore: 104,
};

describe("BeatTheModelCard", () => {
  it("withholds the score and the graded state until a call is made", () => {
    renderWithProviders(<BeatTheModelCard challenge={CHALLENGE} />);

    expect(screen.getByText(/result hidden/i)).toBeInTheDocument();
    expect(screen.queryByText(/121/)).not.toBeInTheDocument();
    expect(screen.queryByText("Correct")).not.toBeInTheDocument();
    expect(screen.queryByText("Missed")).not.toBeInTheDocument();
  });

  it("shows the model's read from the favoured side, not always the home side", () => {
    renderWithProviders(<BeatTheModelCard challenge={CHALLENGE} />);

    // homeWinProbability is 0.36, so the model favours the AWAY team at 64%.
    // Reading it off the home side would invert the whole card.
    expect(
      screen.getByRole("img", { name: "Model win probability: DEN 36%, OKC 64%" })
    ).toBeInTheDocument();
    // Once in the model-read sentence, once in the bar's own labels.
    expect(screen.getAllByText("OKC 64%")).toHaveLength(2);
  });

  it("credits the model when it called the same winner", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BeatTheModelCard challenge={MODEL_WAS_RIGHT} />);

    await user.click(screen.getByRole("button", { name: MODEL_WAS_RIGHT.homeCity }));

    expect(screen.getByText("Correct")).toBeInTheDocument();
    expect(screen.getByText(/the model had it too — den at 68%/i)).toBeInTheDocument();
  });

  it("marks the call missed while still crediting a correct model", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BeatTheModelCard challenge={MODEL_WAS_RIGHT} />);

    await user.click(screen.getByRole("button", { name: MODEL_WAS_RIGHT.awayCity }));

    expect(screen.getByText("Missed")).toBeInTheDocument();
    expect(screen.getByText(/the model had it too/i)).toBeInTheDocument();
  });

  it("labels the graded card and offers the next call", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BeatTheModelCard challenge={CHALLENGE} />);

    await user.click(screen.getByRole("button", { name: CHALLENGE.homeCity }));

    expect(screen.getByText(/graded/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next call/i })).toBeInTheDocument();
  });
});
