import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OptimizerPage } from "./OptimizerPage";
import { fetchLatestLineup, fetchPlayerPredictions } from "@/lib/nbaApi";
import { saveLineup } from "@/lib/meApi";
import { useMe } from "@/lib/useMe";
import { ApiError } from "@/lib/apiClient";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import type { Lineup, LineupSlot, Player, PlayerPredictionListItem, Team } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchLatestLineup: vi.fn(),
  fetchPlayerPrediction: vi.fn(),
  fetchPlayerPredictions: vi.fn(),
  fetchPlayers: vi.fn(),
}));

vi.mock("@/lib/meApi", () => ({
  saveLineup: vi.fn(),
}));

// The page only reads `session` from useMe (to gate the save button), so a
// direct mock is enough — no QueryClient-driven fetchMe to satisfy.
vi.mock("@/lib/useMe", () => ({ useMe: vi.fn() }));

const LAKERS: Team = {
  id: "team-1",
  nbaTeamId: 1,
  name: "Lakers",
  abbreviation: "LAL",
  city: "Los Angeles",
  conference: "West",
  division: "Pacific",
  logoUrl: null,
};

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    nbaPlayerId: 1,
    firstName: "LeBron",
    lastName: "James",
    position: "F",
    heightInches: null,
    weightLbs: null,
    jerseyNumber: null,
    headshotUrl: null,
    teamId: LAKERS.id,
    team: LAKERS,
    birthDate: null,
    school: null,
    country: null,
    lastAffiliation: null,
    seasonExp: null,
    rosterStatus: null,
    draftYear: null,
    draftRound: null,
    draftNumber: null,
    ...overrides,
  };
}

// Solver-legal five: one pure guard (Curry), three forwards — Davis's "F-C"
// must count via substring match, the way optimize.py checks positions —
// and a center. Totals: 207.08 pts, $47,400 of a $50,000 cap.
const CURRY = makePlayer({ id: "player-1", nbaPlayerId: 1, firstName: "Stephen", lastName: "Curry", position: "G", jerseyNumber: "30" });
const DAVIS = makePlayer({ id: "player-2", nbaPlayerId: 2, firstName: "Anthony", lastName: "Davis", position: "F-C", jerseyNumber: "3" });
const JAMES = makePlayer({ id: "player-3", nbaPlayerId: 3, firstName: "LeBron", lastName: "James", position: "F", jerseyNumber: "23" });
const EMBIID = makePlayer({ id: "player-4", nbaPlayerId: 4, firstName: "Joel", lastName: "Embiid", position: "C", jerseyNumber: "21" });
const DONCIC = makePlayer({ id: "player-5", nbaPlayerId: 5, firstName: "Luka", lastName: "Doncic", position: "F", jerseyNumber: "77" });

function makeSlot(player: Player, predictedFantasyPoints: number, salary: number): LineupSlot {
  return { id: `slot-${player.id}`, lineupId: "lineup-1", playerId: player.id, player, predictedFantasyPoints, salary };
}

const LINEUP: Lineup = {
  id: "lineup-1",
  totalPredictedPoints: 207.08,
  totalSalary: 47_400,
  budget: 50_000,
  createdAt: "2026-09-12T00:00:00.000Z",
  slots: [
    makeSlot(CURRY, 38.5, 8_800),
    makeSlot(DAVIS, 43.28, 9_400),
    makeSlot(JAMES, 41.0, 9_500),
    makeSlot(EMBIID, 40.2, 9_700),
    makeSlot(DONCIC, 44.1, 10_000),
  ],
};

// Same five slots relabelled so no position contains "G" — size, forwards
// and cap all pass, isolating the guard rule as the only unmet constraint.
const LINEUP_WITHOUT_GUARDS: Lineup = {
  ...LINEUP,
  slots: LINEUP.slots.map((slot, index) => ({
    ...slot,
    player: { ...slot.player, position: ["F", "F-C", "F", "C", "F"][index] },
  })),
};

// A four-player board with cap headroom — suggestions only render while
// there is an empty slot, and these salaries leave $35,000 of the $50,000
// cap for the suggestion panel to work with.
const LINEUP_WITH_HEADROOM: Lineup = {
  ...LINEUP,
  totalPredictedPoints: 162.98,
  totalSalary: 15_000,
  slots: LINEUP.slots.slice(0, 4).map((slot, index) => ({ ...slot, salary: [2_000, 4_000, 4_000, 5_000][index] })),
};

const GREEN = makePlayer({ id: "player-6", nbaPlayerId: 6, firstName: "Jalen", lastName: "Green", position: "G", jerseyNumber: "4" });
const SENGUN = makePlayer({ id: "player-7", nbaPlayerId: 7, firstName: "Alperen", lastName: "Sengun", position: "C", jerseyNumber: "28" });

// Sengun is the better value ($200/pt vs Green's $267/pt) — the panel must
// rank him first on value alone.
const PREDICTIONS: PlayerPredictionListItem[] = [
  { playerId: SENGUN.id, predictedFantasyPoints: 35, salary: 7_000, asOf: "2026-09-12T09:00:00.000Z", player: SENGUN },
  { playerId: GREEN.id, predictedFantasyPoints: 30, salary: 8_000, asOf: "2026-09-12T09:00:00.000Z", player: GREEN },
];

const SAVED_LINEUP = {
  id: "saved-1",
  budget: 50_000,
  name: null,
  createdAt: "2026-09-12T10:00:00.000Z",
  totalPredictedPointsAtSave: 207.08,
  totalSalaryAtSave: 47_400,
  drift: null,
  slots: [],
};

describe("OptimizerPage", () => {
  beforeEach(() => {
    // Signed-in by default; the signed-out behaviour has its own test.
    vi.mocked(useMe).mockReturnValue({ session: { user: {} } } as never);
    // No suggestions unless a test opts in by mocking its own list.
    vi.mocked(fetchPlayerPredictions).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("has no automated accessibility violations", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);
    vi.mocked(saveLineup).mockResolvedValue(SAVED_LINEUP as never);

    const { container } = renderWithProviders(<main><OptimizerPage /></main>);
    await screen.findByText("Stephen Curry");

    await expectNoAccessibilityViolations(container);

    // The save flow opens a name prompt — run axe over the open dialog too.
    await user.click(screen.getByRole("button", { name: "Save lineup" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await expectNoAccessibilityViolations(container);
  });

  it("admits in the header that the salaries are synthetic", async () => {
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

    renderWithProviders(<OptimizerPage />);

    expect(await screen.findByText(/the salaries are synthetic/i)).toBeInTheDocument();
  });

  it("renders the lineup totals, salary meter and derived $/pt column", async () => {
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

    const { container } = renderWithProviders(<OptimizerPage />);

    expect(await screen.findByText("Stephen Curry")).toBeInTheDocument();
    // One decorative headshot per row (alt="" — the name link beside it carries the text).
    expect(container.querySelectorAll('img[src*="headshots"]')).toHaveLength(5);
    // Server totals shown verbatim: 207.08 pts renders as 207.1.
    expect(screen.getByText("207.1")).toBeInTheDocument();
    expect(screen.getByText("$47,400")).toBeInTheDocument();
    expect(screen.getByText("$50,000")).toBeInTheDocument();
    // Meter caption: 47,400 / 50,000 = 95% of cap, $2,600 of headroom.
    expect(screen.getByText(/95% of cap/)).toBeInTheDocument();
    expect(screen.getByText(/\$2,600 under the cap/)).toBeInTheDocument();
    // $/pt is derived from each row's own numbers: 8,800 / 38.5 ≈ $229/pt.
    expect(screen.getByText("$229/pt")).toBeInTheDocument();
    expect(screen.getByText("$217/pt")).toBeInTheDocument();
  });

  it("marks every solver constraint met for a legal lineup", async () => {
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

    renderWithProviders(<OptimizerPage />);
    await screen.findByText("Stephen Curry");

    expect(screen.getByText("Exactly 5 players")).toBeInTheDocument();
    expect(screen.getByText("5 of 5 on the board")).toBeInTheDocument();
    // Curry is the only "G" position; Davis's "F-C" counts as a forward.
    expect(screen.getByText("1 on the board")).toBeInTheDocument();
    expect(screen.getByText("3 on the board")).toBeInTheDocument();
    // HitMissPill renders the word with a glyph — the text itself is just "met".
    expect(screen.getAllByText("met")).toHaveLength(5);
    expect(
      screen.getByText("This board meets every solver constraint — save it to your profile.")
    ).toBeInTheDocument();
  });

  it("shows a friendly empty state when no lineup has been generated yet (404)", async () => {
    vi.mocked(fetchLatestLineup).mockRejectedValue(new ApiError("not found", 404));

    renderWithProviders(<OptimizerPage />);

    expect(await screen.findByText(/No lineup has been generated yet/)).toBeInTheDocument();
  });

  it("shows an ErrorState and retries the query when Retry is clicked, for a non-404 error", async () => {
    vi.mocked(fetchLatestLineup).mockRejectedValue(new ApiError("server error", 500));
    const user = userEvent.setup();

    renderWithProviders(<OptimizerPage />);

    expect(await screen.findByText("Could not load the optimized lineup.")).toBeInTheDocument();

    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Stephen Curry")).toBeInTheDocument();
  });

  it("re-sums totals locally when a player is removed, blocks saving, then resets", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

    renderWithProviders(<OptimizerPage />);
    await screen.findByText("Stephen Curry");

    await user.click(screen.getByRole("button", { name: "Edit lineup" }));
    await user.click(screen.getByRole("button", { name: "Remove Stephen Curry from the lineup" }));

    // 207.08 - 38.5 = 168.58 renders as 168.6; $47,400 - $8,800 = $38,600.
    expect(screen.getByText("168.6")).toBeInTheDocument();
    expect(screen.getByText("$38,600")).toBeInTheDocument();
    expect(screen.getByText("4 of 5 on the board")).toBeInTheDocument();
    expect(screen.getByText("This board needs 1 more player before it can be saved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save lineup" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByText("207.1")).toBeInTheDocument();
    expect(screen.getByText("$47,400")).toBeInTheDocument();
  });

  it("flags the guard rule unmet when no position on the board contains 'G'", async () => {
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP_WITHOUT_GUARDS);

    renderWithProviders(<OptimizerPage />);
    await screen.findByText("Stephen Curry");

    expect(screen.getByText("At least 1 guard")).toBeInTheDocument();
    expect(screen.getByText("0 on the board")).toBeInTheDocument();
    expect(screen.getByText("unmet")).toBeInTheDocument();
    expect(screen.getByText("This board needs at least one guard before it can be saved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save lineup" })).toBeDisabled();
  });

  it("conveys an over-cap budget edit in words, not colour alone", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

    renderWithProviders(<OptimizerPage />);
    await screen.findByText("Stephen Curry");

    await user.click(screen.getByRole("button", { name: "Edit lineup" }));
    const budgetInput = screen.getByRole("spinbutton", { name: "Edit budget cap" });
    await user.clear(budgetInput);
    await user.type(budgetInput, "10000");

    expect(screen.getByText(/\$37,400 OVER the cap/)).toBeInTheDocument();
    expect(screen.getByText(/\$37,400 over the cap — swap a player or raise the budget/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save lineup" })).toBeDisabled();
  });

  it("saves a solver-legal board with the frozen slot values, then links to the profile", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);
    vi.mocked(saveLineup).mockResolvedValue(SAVED_LINEUP as never);

    renderWithProviders(<OptimizerPage />);
    await screen.findByText("Stephen Curry");

    await user.click(screen.getByRole("button", { name: "Save lineup" }));

    // Saving is a two-step flow: the click opens the name prompt, and the
    // POST only fires once the lineup is named.
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: "Lineup name" }), "Week 3 flyers");
    await user.click(within(dialog).getByRole("button", { name: "Save lineup" }));

    expect(saveLineup).toHaveBeenCalledWith({
      budget: 50_000,
      name: "Week 3 flyers",
      slots: [
        { playerId: "player-1", predictedPointsAtSave: 38.5, salaryAtSave: 8_800 },
        { playerId: "player-2", predictedPointsAtSave: 43.28, salaryAtSave: 9_400 },
        { playerId: "player-3", predictedPointsAtSave: 41, salaryAtSave: 9_500 },
        { playerId: "player-4", predictedPointsAtSave: 40.2, salaryAtSave: 9_700 },
        { playerId: "player-5", predictedPointsAtSave: 44.1, salaryAtSave: 10_000 },
      ],
    });
    expect(await screen.findByText("Saved —", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "view it on your profile" })).toHaveAttribute("href", "/profile");
  });

  it("blocks the save until the lineup is named, and Escape cancels the prompt", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

    renderWithProviders(<OptimizerPage />);
    await screen.findByText("Stephen Curry");

    await user.click(screen.getByRole("button", { name: "Save lineup" }));
    const dialog = screen.getByRole("dialog");

    // Every lineup needs a name — the confirm stays dead until one is typed.
    expect(within(dialog).getByRole("button", { name: "Save lineup" })).toBeDisabled();
    expect(saveLineup).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("textbox", { name: "Lineup name" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveLineup).not.toHaveBeenCalled();
  });

  it("trims the typed name before sending it", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);
    vi.mocked(saveLineup).mockResolvedValue(SAVED_LINEUP as never);

    renderWithProviders(<OptimizerPage />);
    await screen.findByText("Stephen Curry");

    await user.click(screen.getByRole("button", { name: "Save lineup" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: "Lineup name" }), "  Week 3 flyers  ");
    await user.click(within(dialog).getByRole("button", { name: "Save lineup" }));

    expect(saveLineup).toHaveBeenCalledWith(expect.objectContaining({ name: "Week 3 flyers" }));
  });

  it("suggests value adds that fit the budget while editing, ranked by $/pt", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP_WITH_HEADROOM);
    vi.mocked(fetchPlayerPredictions).mockResolvedValue(PREDICTIONS);

    renderWithProviders(<OptimizerPage />);
    await screen.findByText("Stephen Curry");

    // Hidden until edit mode — suggestions only matter while changing the board.
    expect(screen.queryByText("Suggested adds")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit lineup" }));

    expect(await screen.findByText("Suggested adds")).toBeInTheDocument();
    // Sengun's $200/pt beats Green's $267/pt on value alone.
    const addButtons = screen.getAllByRole("button", { name: /add .* to the lineup$/i });
    expect(addButtons[0]).toHaveAccessibleName("Add Alperen Sengun to the lineup");
    expect(addButtons[1]).toHaveAccessibleName("Add Jalen Green to the lineup");

    await user.click(addButtons[0]);

    // $15,000 + $7,000; Sengun's row lands on the board with his own numbers.
    expect(await screen.findByText("Alperen Sengun")).toBeInTheDocument();
    expect(screen.getByText("$22,000")).toBeInTheDocument();
    expect(screen.getByText("198.0")).toBeInTheDocument();
  });

  it("boosts suggestions that fill an unmet position need above pure value", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP_WITH_HEADROOM);
    vi.mocked(fetchPlayerPredictions).mockResolvedValue(PREDICTIONS);

    renderWithProviders(<OptimizerPage />);
    await screen.findByText("Stephen Curry");

    await user.click(screen.getByRole("button", { name: "Edit lineup" }));
    await user.click(screen.getByRole("button", { name: "Remove Stephen Curry from the lineup" }));

    // The board has no guard now, so Green — worse $/pt but a "G" — ranks
    // first and carries the needs-guard tag.
    const addButtons = await screen.findAllByRole("button", { name: /add .* to the lineup$/i });
    expect(addButtons[0]).toHaveAccessibleName("Add Jalen Green to the lineup");
    expect(screen.getByText(/fills your guard slot/)).toBeInTheDocument();
  });

  it("says so when no suggestion fits the remaining budget", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP_WITH_HEADROOM);
    // fetchPlayerPredictions defaults to [] from beforeEach.

    renderWithProviders(<OptimizerPage />);
    await screen.findByText("Stephen Curry");
    await user.click(screen.getByRole("button", { name: "Edit lineup" }));

    expect(await screen.findByText("No predicted players fit the remaining budget.")).toBeInTheDocument();
  });

  it("disables saving for a signed-out visitor and says why", async () => {
    vi.mocked(useMe).mockReturnValue({ session: null } as never);
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

    renderWithProviders(<OptimizerPage />);
    await screen.findByText("Stephen Curry");

    expect(screen.getByText("Sign in to save this lineup to your profile.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save lineup" })).toBeDisabled();
    expect(saveLineup).not.toHaveBeenCalled();
  });
});
