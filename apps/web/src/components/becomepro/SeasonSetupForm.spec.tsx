import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { makeProspectSeason } from "@/test/becomeProFixtures";
import { createProspectSeason, updateProspectSeason } from "@/lib/becomeProApi";
import { ApiError } from "@/lib/apiClient";
import { recentLeagueYears } from "@/lib/prospectValue";
import { SeasonSetupForm } from "./SeasonSetupForm";

vi.mock("@/lib/becomeProApi", () => ({
  createProspectSeason: vi.fn(),
  updateProspectSeason: vi.fn(),
  invalidateBecomeProQueries: vi.fn().mockResolvedValue(undefined),
}));

const CURRENT_YEAR = recentLeagueYears(new Date())[0];

describe("SeasonSetupForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createProspectSeason).mockResolvedValue(makeProspectSeason({ id: "new-season" }));
    vi.mocked(updateProspectSeason).mockResolvedValue(makeProspectSeason());
  });

  describe("starting a season", () => {
    it("creates a season with the chosen details", async () => {
      const onDone = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<SeasonSetupForm onDone={onDone} />);

      await user.selectOptions(screen.getByLabelText(/competition level/i), "NCAA_D2");
      await user.selectOptions(screen.getByLabelText(/position/i), "F");
      await user.type(screen.getByLabelText(/team/i), "Riverside College");
      await user.click(screen.getByRole("button", { name: /start season/i }));

      expect(createProspectSeason).toHaveBeenCalledWith({
        season: CURRENT_YEAR,
        competitionLevel: "NCAA_D2",
        position: "F",
        teamName: "Riverside College",
      });
      expect(onDone).toHaveBeenCalledWith("new-season");
    });

    // An empty optional field is absent, not an empty string pretending to be
    // a team name.
    it("sends no team name when the field is left blank", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SeasonSetupForm onDone={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /start season/i }));

      expect(vi.mocked(createProspectSeason).mock.calls[0]?.[0].teamName).toBeNull();
    });

    // A list that cannot produce a duplicate beats an error after the fact.
    it("does not offer a league year the user already has", () => {
      renderWithProviders(<SeasonSetupForm onDone={vi.fn()} takenSeasons={[CURRENT_YEAR]} />);

      const options = Array.from(screen.getByLabelText("Season").querySelectorAll("option")).map(
        (option) => option.textContent
      );
      expect(options).not.toContain(CURRENT_YEAR);
    });

    it("explains why the competition level matters", () => {
      renderWithProviders(<SeasonSetupForm onDone={vi.fn()} />);

      expect(screen.getByText(/translated to Division I level before it is valued/i)).toBeInTheDocument();
    });

    it("surfaces the API's own error message", async () => {
      vi.mocked(createProspectSeason).mockRejectedValue(
        new ApiError(`You have already logged a ${CURRENT_YEAR} season`, 409)
      );
      const user = userEvent.setup();
      renderWithProviders(<SeasonSetupForm onDone={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /start season/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(`You have already logged a ${CURRENT_YEAR} season`);
    });
  });

  describe("editing a season", () => {
    it("opens filled in with the season's details", () => {
      renderWithProviders(
        <SeasonSetupForm season={makeProspectSeason({ competitionLevel: "NCAA_D2", teamName: "Riverside" })} onDone={vi.fn()} />
      );

      expect(screen.getByLabelText(/competition level/i)).toHaveValue("NCAA_D2");
      expect(screen.getByLabelText(/team/i)).toHaveValue("Riverside");
    });

    it("saves changed details to the existing season", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SeasonSetupForm season={makeProspectSeason()} onDone={vi.fn()} />);

      await user.selectOptions(screen.getByLabelText(/competition level/i), "NCAA_D1");
      await user.click(screen.getByRole("button", { name: /save details/i }));

      expect(updateProspectSeason).toHaveBeenCalledWith(
        "season-1",
        expect.objectContaining({ competitionLevel: "NCAA_D1" })
      );
    });

    it("keeps the season's own league year selectable", () => {
      renderWithProviders(
        <SeasonSetupForm season={makeProspectSeason({ season: "2025-26" })} takenSeasons={["2025-26"]} onDone={vi.fn()} />
      );

      expect(screen.getByLabelText("Season")).toHaveValue("2025-26");
    });

    it("can be cancelled", async () => {
      const onCancel = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<SeasonSetupForm season={makeProspectSeason()} onDone={vi.fn()} onCancel={onCancel} />);

      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(onCancel).toHaveBeenCalled();
    });
  });

  it("says so when every recent league year is taken", () => {
    renderWithProviders(<SeasonSetupForm onDone={vi.fn()} takenSeasons={recentLeagueYears(new Date())} />);

    expect(screen.getByText(/already have a season for every recent league year/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start season/i })).toBeDisabled();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithProviders(<SeasonSetupForm onDone={vi.fn()} />);

    await expectNoAccessibilityViolations(container);
  });
});
