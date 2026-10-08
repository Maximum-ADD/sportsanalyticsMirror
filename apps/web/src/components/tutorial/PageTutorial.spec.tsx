import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_TUTORIAL } from "@/components/home/homeTutorial";
import { useSession } from "@/lib/authClient";
import { markTutorialSeen, updateMe } from "@/lib/meApi";
import { ME_QUERY_KEY } from "@/lib/useMe";
import type { MeProfile } from "@/types/nba";
import { PageTutorial } from "./PageTutorial";

vi.mock("@/lib/authClient", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/meApi", () => ({ fetchMe: vi.fn(), markTutorialSeen: vi.fn(), updateMe: vi.fn() }));

const PROFILE: MeProfile = {
  id: "user-1",
  email: "user@example.com",
  name: "User",
  username: "user",
  avatarUrl: null,
  favoriteTeam: null,
  followedPlayers: [],
  role: "USER",
  seenTutorialIds: [],
  autoOpenTutorials: true,
};

/** Renders the tutorial with the profile already loaded, as ProfileGate leaves it. */
function renderTutorial(profile: MeProfile) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, retry: false } } });
  queryClient.setQueryData(ME_QUERY_KEY, profile);
  return render(
    <QueryClientProvider client={queryClient}>
      <PageTutorial tutorial={HOME_TUTORIAL} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(useSession).mockReturnValue({ data: { user: { id: PROFILE.id } }, isPending: false } as never);
  vi.mocked(markTutorialSeen).mockResolvedValue({ seen: true });
  vi.mocked(updateMe).mockResolvedValue(PROFILE);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PageTutorial", () => {
  it("opens the tutorial by itself on the account's first visit", () => {
    renderTutorial(PROFILE);

    expect(screen.getByRole("dialog", { name: "Page tutorial · home" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Welcome to your locker" })).toBeInTheDocument();
  });

  it("closes for good on Exit, and the ? button brings it back from the first step", async () => {
    const user = userEvent.setup();
    renderTutorial(PROFILE);

    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.click(screen.getByRole("button", { name: "Exit the tutorial" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(markTutorialSeen).toHaveBeenCalledWith("home");

    await user.click(screen.getByRole("button", { name: "Show the home page tutorial" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(`Step 1 of ${HOME_TUTORIAL.steps.length}`)).toBeInTheDocument();
  });

  it("only offers the ? button when the tutorial has already been seen", () => {
    renderTutorial({ ...PROFILE, seenTutorialIds: ["home"] });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const helpButton = screen.getByRole("button", { name: "Show the home page tutorial" });
    expect(helpButton).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("walks every home step to Complete, which closes it and records it as seen", async () => {
    const user = userEvent.setup();
    renderTutorial(PROFILE);

    for (let stepNumber = 1; stepNumber < HOME_TUTORIAL.steps.length; stepNumber++) {
      await user.click(screen.getByRole("button", { name: "Next step" }));
    }
    expect(screen.getByRole("heading", { name: "Replay any time" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Complete the tutorial" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(markTutorialSeen).toHaveBeenCalledExactlyOnceWith("home");
  });
});
