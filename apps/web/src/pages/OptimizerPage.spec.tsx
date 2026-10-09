import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OptimizerPage } from "./OptimizerPage";
import { fetchLatestLineup, fetchPlayerPredictions, fetchPlayers, solveLineup, type SolveLineupParams } from "@/lib/nbaApi";
import { saveLineup } from "@/lib/meApi";
import { useMe } from "@/lib/useMe";
import { ApiError } from "@/lib/apiClient";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import type {
  Lineup,
  LineupSlot,
  Player,
  PlayerPredictionListItem,
  SolvedLineupSlot,
  SolveLineupResponse,
  Team,
} from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchLatestLineup: vi.fn(),
  fetchPlayerPrediction: vi.fn(),
  fetchPlayerPredictions: vi.fn(),
  fetchPlayers: vi.fn(),
  solveLineup: vi.fn(),
}));

vi.mock("@/lib/meApi", () => ({
  saveLineup: vi.fn(),
  // The page tutorial's writes — see the "?" button test below.
  markTutorialSeen: vi.fn(),
  updateMe: vi.fn(),
}));

// The page only reads `session` from useMe (to gate the save button), so a
// direct mock is enough — no QueryClient-driven fetchMe to satisfy. With no
// profile in it, the page tutorial never opens by itself here. ME_QUERY_KEY
// is the page tutorial's: it writes the cached profile under that key when
// the tutorial closes.
vi.mock("@/lib/useMe", () => ({ ME_QUERY_KEY: ["me"], useMe: vi.fn() }));

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

function makeSolvedSlot(player: Player, predictedFantasyPoints: number, salary: number): SolvedLineupSlot {
  return { playerId: player.id, player, predictedFantasyPoints, salary, isLocked: false };
}

// LINEUP's own five as the solver returns them.
const SOLVED_PRECOMPUTED_FIVE = {
  rank: 1,
  totalPredictedPoints: 207.08,
  totalSalary: 47_400,
  slots: LINEUP.slots.map((slot) => makeSolvedSlot(slot.player, slot.predictedFantasyPoints!, slot.salary!)),
};

// What POST /v1/optimizer/solve answers under any rule in these tests:
// LINEUP with Green in Doncic's place. 192.98 pts (shown as 193.0) and
// $45,400, so a solved board is easy to tell from the precomputed one.
const SOLVED: SolveLineupResponse = {
  budget: 50_000,
  rules: { lineupSize: 5, minimumGuards: 1, minimumForwards: 1 },
  lockedPlayerIds: [],
  excludedPlayerIds: [],
  projectionsAsOf: "2026-09-12T09:00:00.000Z",
  lineups: [
    {
      rank: 1,
      totalPredictedPoints: 192.98,
      totalSalary: 45_400,
      slots: [
        makeSolvedSlot(CURRY, 38.5, 8_800),
        makeSolvedSlot(DAVIS, 43.28, 9_400),
        makeSolvedSlot(JAMES, 41.0, 9_500),
        makeSolvedSlot(EMBIID, 40.2, 9_700),
        makeSolvedSlot(GREEN, 30, 8_000),
      ],
    },
  ],
};

// With no rules: the precomputed five again, and no other lineup.
const SOLVED_WITHOUT_RULES: SolveLineupResponse = { ...SOLVED, lineups: [SOLVED_PRECOMPUTED_FIVE] };

function hasRules(params: SolveLineupParams): boolean {
  return (params.lockedPlayerIds?.length ?? 0) + (params.excludedPlayerIds?.length ?? 0) > 0;
}

// The API echoes the rules back, and the page only lets an answer solved
// under some rule replace the precomputed lineup, so the mock echoes too.
function answer(response: SolveLineupResponse, params: SolveLineupParams): SolveLineupResponse {
  return { ...response, lockedPlayerIds: params.lockedPlayerIds ?? [], excludedPlayerIds: params.excludedPlayerIds ?? [] };
}

function solveCallsWithRules(): SolveLineupParams[] {
  return vi.mocked(solveLineup).mock.calls.map(([params]) => params).filter(hasRules);
}

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
    vi.mocked(solveLineup).mockImplementation(async (params) =>
      answer(hasRules(params) ? SOLVED : SOLVED_WITHOUT_RULES, params)
    );
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

  describe("lineup rules", () => {
    it("locks a player from their row, solves under that rule and shows the solved lineup", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

      renderWithProviders(<OptimizerPage />);
      await screen.findByText("Stephen Curry");
      // No rules yet, so the board is the precomputed lineup.
      expect(solveCallsWithRules()).toHaveLength(0);
      expect(screen.getByText("No rules set, so the lineup below is the solver's own pick.")).toBeInTheDocument();

      const lockButton = screen.getByRole("button", { name: "Must include Stephen Curry" });
      expect(lockButton).toHaveAttribute("aria-pressed", "false");
      await user.click(lockButton);

      expect(await screen.findByText("Jalen Green")).toBeInTheDocument();
      expect(solveLineup).toHaveBeenCalledWith({
        budget: 50_000,
        lockedPlayerIds: ["player-1"],
        excludedPlayerIds: [],
        alternatives: 3,
      });
      expect(screen.queryByText("Luka Doncic")).not.toBeInTheDocument();
      expect(screen.getByText("193.0")).toBeInTheDocument();
      expect(screen.getByText("$45,400")).toBeInTheDocument();
      expect(screen.getByText(/Solved with your rules/)).toBeInTheDocument();
      expect(screen.getByText("The lineup below is the best one that follows your rules.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Must include Stephen Curry" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Stop requiring Stephen Curry" })).toBeInTheDocument();
    });

    it("excludes a player from their row and moves focus to the lineup heading", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

      renderWithProviders(<OptimizerPage />);
      await screen.findByText("Luka Doncic");

      await user.click(screen.getByRole("button", { name: "Exclude Luka Doncic" }));

      // The row and its button go away once the solve lands, so focus
      // can't stay on the button.
      expect(screen.getByRole("heading", { name: "The lineup" })).toHaveFocus();
      expect(await screen.findByText("Jalen Green")).toBeInTheDocument();
      expect(solveLineup).toHaveBeenCalledWith({
        budget: 50_000,
        lockedPlayerIds: [],
        excludedPlayerIds: ["player-5"],
        alternatives: 3,
      });
      expect(screen.getByRole("button", { name: "Allow Luka Doncic again" })).toBeInTheDocument();
    });

    it("adds a rule from the search, and Clear all rules goes back to the solver's own lineup", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);
      vi.mocked(fetchPlayers).mockResolvedValue({ data: [GREEN], total: 1, page: 1, pageSize: 8 } as never);

      renderWithProviders(<OptimizerPage />);
      await screen.findByText("Stephen Curry");

      await user.type(screen.getByRole("combobox", { name: "Search for a player the lineup must include" }), "Green");
      await user.click(await screen.findByRole("option", { name: /Jalen Green/ }));

      expect(await screen.findByText("193.0")).toBeInTheDocument();
      expect(solveLineup).toHaveBeenCalledWith({
        budget: 50_000,
        lockedPlayerIds: ["player-6"],
        excludedPlayerIds: [],
        alternatives: 3,
      });

      await user.click(screen.getByRole("button", { name: "Clear all rules" }));

      expect(screen.getByText("Luka Doncic")).toBeInTheDocument();
      expect(screen.getByText("207.1")).toBeInTheDocument();
      expect(screen.getByText("No rules set, so the lineup below is the solver's own pick.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Clear all rules" })).not.toBeInTheDocument();
      // Focus stays in the panel rather than falling to the page body.
      expect(screen.getByRole("combobox", { name: "Search for a player the lineup must include" })).toHaveFocus();
      expect(solveCallsWithRules()).toHaveLength(1);
    });

    it("explains in plain words when no lineup fits the rules, in place of the lineup", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);
      const reason = "Stephen Curry costs $8,800, which leaves too little of the $50,000 budget for the rest.";
      vi.mocked(solveLineup).mockImplementation(async (params) => {
        if (hasRules(params)) throw new ApiError(reason, 400);
        return answer(SOLVED_WITHOUT_RULES, params);
      });

      const { container } = renderWithProviders(<main><OptimizerPage /></main>);
      await screen.findByText("Stephen Curry");
      await user.click(screen.getByRole("button", { name: "Must include Stephen Curry" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(reason);
      expect(screen.getByRole("heading", { name: "No lineup fits your rules" })).toBeInTheDocument();
      // A 400 is the rules' fault, so it isn't retried and there's nothing to retry.
      expect(solveCallsWithRules()).toHaveLength(1);
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
      // Showing the precomputed lineup here would quietly ignore the rules.
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      await expectNoAccessibilityViolations(container);

      await user.click(screen.getByRole("button", { name: "Stop requiring Stephen Curry" }));

      expect(await screen.findByText("Luka Doncic")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("offers Try again when the solve fails on the server's side", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);
      vi.mocked(solveLineup).mockImplementation(async (params) => {
        if (hasRules(params)) throw new ApiError("Internal server error", 500);
        return answer(SOLVED_WITHOUT_RULES, params);
      });

      renderWithProviders(<OptimizerPage />);
      await screen.findByText("Stephen Curry");
      await user.click(screen.getByRole("button", { name: "Must include Stephen Curry" }));

      // A server error is retried once, about a second later, before the page gives up.
      const tryAgain = await screen.findByRole("button", { name: "Try again" }, { timeout: 3_000 });
      expect(solveCallsWithRules()).toHaveLength(2);
      expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong on our side while solving.");

      vi.mocked(solveLineup).mockImplementation(async (params) => answer(SOLVED, params));
      await user.click(tryAgain);

      expect(await screen.findByText("Jalen Green")).toBeInTheDocument();
    });

    it("has no automated accessibility violations with rules set", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

      const { container } = renderWithProviders(<main><OptimizerPage /></main>);
      await screen.findByText("Stephen Curry");
      await user.click(screen.getByRole("button", { name: "Must include Stephen Curry" }));
      await screen.findByText("Jalen Green");
      await user.click(screen.getByRole("button", { name: "Exclude LeBron James" }));
      await screen.findByRole("button", { name: "Allow LeBron James again" });

      await expectNoAccessibilityViolations(container);
    });
  });

  describe("alternative lineups", () => {
    // Under the cap with no rules: LINEUP's five, then Green for Doncic
    // (192.98 pts, $45,400), then Sengun for Embiid (201.88 pts, $44,700).
    const GREEN_FOR_DONCIC = { ...SOLVED.lineups[0], rank: 2 };
    const SENGUN_FOR_EMBIID = {
      rank: 3,
      totalPredictedPoints: 201.88,
      totalSalary: 44_700,
      slots: [
        makeSolvedSlot(CURRY, 38.5, 8_800),
        makeSolvedSlot(DAVIS, 43.28, 9_400),
        makeSolvedSlot(JAMES, 41.0, 9_500),
        makeSolvedSlot(SENGUN, 35, 7_000),
        makeSolvedSlot(DONCIC, 44.1, 10_000),
      ],
    };

    function alternativesSection() {
      return screen.getByRole("region", { name: "Alternative lineups" });
    }

    it("lists the next best lineups under the precomputed one, with the players each swaps", async () => {
      vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);
      vi.mocked(solveLineup).mockImplementation(async (params) =>
        answer({ ...SOLVED, lineups: [SOLVED_PRECOMPUTED_FIVE, GREEN_FOR_DONCIC, SENGUN_FOR_EMBIID] }, params)
      );

      const { container } = renderWithProviders(<main><OptimizerPage /></main>);
      await screen.findByText("Stephen Curry");

      expect(solveLineup).toHaveBeenCalledWith({
        budget: 50_000,
        lockedPlayerIds: [],
        excludedPlayerIds: [],
        alternatives: 3,
      });
      // The solver's copy of the precomputed lineup isn't an alternative to itself.
      const items = await within(alternativesSection()).findAllByRole("listitem");
      expect(items).toHaveLength(2);

      expect(within(items[0]).getByRole("heading", { name: "Alternative 1" })).toBeInTheDocument();
      expect(items[0]).toHaveTextContent("193.0 projected pts · $45,400");
      expect(items[0]).toHaveTextContent("14.1 fewer than the best");
      const [firstOut, firstIn] = within(items[0]).getAllByRole("definition");
      expect(firstOut).toHaveTextContent("Luka Doncic");
      expect(firstIn).toHaveTextContent("Jalen Green");

      expect(items[1]).toHaveTextContent("201.9 projected pts · $44,700");
      expect(items[1]).toHaveTextContent("5.2 fewer than the best");
      const [secondOut, secondIn] = within(items[1]).getAllByRole("definition");
      expect(secondOut).toHaveTextContent("Joel Embiid");
      expect(secondIn).toHaveTextContent("Alperen Sengun");

      await expectNoAccessibilityViolations(container);
    });

    it("compares the alternatives with the lineup solved under the rules", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);
      vi.mocked(solveLineup).mockImplementation(async (params) =>
        answer(
          hasRules(params)
            ? { ...SOLVED, lineups: [SOLVED.lineups[0], { ...SOLVED_PRECOMPUTED_FIVE, rank: 2 }] }
            : SOLVED_WITHOUT_RULES,
          params
        )
      );

      renderWithProviders(<OptimizerPage />);
      await screen.findByText("Stephen Curry");
      await user.click(screen.getByRole("button", { name: "Must include Stephen Curry" }));

      const item = await within(alternativesSection()).findByRole("listitem");
      expect(item).toHaveTextContent("207.1 projected pts · $47,400");
      expect(item).toHaveTextContent("14.1 more than the best");
      const [playersOut, playersIn] = within(item).getAllByRole("definition");
      expect(playersOut).toHaveTextContent("Jalen Green");
      expect(playersIn).toHaveTextContent("Luka Doncic");
    });

    it("says so when no other lineup fits the same rules", async () => {
      vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

      renderWithProviders(<OptimizerPage />);

      expect(await screen.findByText("No other lineup fits the same rules.")).toBeInTheDocument();
    });

    it("keeps the lineup and offers Try again when the alternatives can't load", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);
      vi.mocked(solveLineup).mockRejectedValue(new ApiError("Internal server error", 500));

      renderWithProviders(<OptimizerPage />);

      // Retried once, about a second later, before the section gives up.
      expect(await screen.findByText("Couldn't load the alternative lineups.", {}, { timeout: 3_000 })).toBeInTheDocument();
      // Only the alternatives depend on this solve; the precomputed lineup stays.
      expect(screen.getByText("Luka Doncic")).toBeInTheDocument();

      vi.mocked(solveLineup).mockImplementation(async (params) => answer(SOLVED_WITHOUT_RULES, params));
      await user.click(within(alternativesSection()).getByRole("button", { name: "Try again" }));

      expect(await screen.findByText("No other lineup fits the same rules.")).toBeInTheDocument();
    });
  });

  // No profile in the useMe mock, so the tutorial never opens by itself
  // (usePageTutorial's own spec covers that); the "?" button needs none.
  it("offers a ? button that replays the optimizer page tutorial over the page", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

    const { container } = renderWithProviders(<main><OptimizerPage /></main>);
    await screen.findByText("Stephen Curry");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show the optimizer page tutorial" }));

    const dialog = screen.getByRole("dialog", { name: "Page tutorial · optimizer" });
    expect(within(dialog).getByRole("heading", { name: "Welcome to the Optimizer" })).toBeInTheDocument();
    // The tutorial opens over the page — run axe over the open dialog too.
    await expectNoAccessibilityViolations(container);
  });
});
