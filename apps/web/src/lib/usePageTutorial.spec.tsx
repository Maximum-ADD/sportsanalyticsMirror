import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "@/lib/authClient";
import { fetchMe, markTutorialSeen, updateMe } from "@/lib/meApi";
import { ME_QUERY_KEY } from "@/lib/useMe";
import type { TutorialCloseReason } from "@/lib/pageTutorial";
import type { MeProfile, Player } from "@/types/nba";
import { usePageTutorial } from "./usePageTutorial";

vi.mock("@/lib/authClient", () => ({ useSession: vi.fn() }));
// The three calls are backed by accountProfile below — a stand-in for the
// account on the server — so a refetch after a close returns what the API
// would, and a test can see whether the cache ends on the account's state.
vi.mock("@/lib/meApi", () => ({ fetchMe: vi.fn(), markTutorialSeen: vi.fn(), updateMe: vi.fn() }));

const TUTORIAL_ID = "home";

// Only the id is read anywhere in this hook's flow; the cast keeps the
// fixture to what the assertions compare.
const PLAYER_ONE = { id: "player-1" } as Player;
const PLAYER_TWO = { id: "player-2" } as Player;

let accountProfile: MeProfile;

function makeProfile(overrides: Partial<MeProfile> = {}): MeProfile {
  return {
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
    ...overrides,
  };
}

/** A promise the test settles by hand, to hold a request in flight. */
function createDeferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

/**
 * Renders the hook behind a few buttons — the same reason useInView's spec
 * uses a probe: the hook is easiest to read through what a page would do
 * with it.
 */
function TutorialProbe() {
  const { isOpen, openTutorial, closeTutorial } = usePageTutorial(TUTORIAL_ID);
  const closeReasons: TutorialCloseReason[] = ["complete", "skip", "skip-all", "exit"];
  return (
    <div>
      <p>{isOpen ? "tutorial open" : "tutorial closed"}</p>
      <button type="button" onClick={openTutorial}>
        replay
      </button>
      {closeReasons.map((reason) => (
        <button key={reason} type="button" onClick={() => closeTutorial(reason)}>
          close: {reason}
        </button>
      ))}
    </div>
  );
}

/**
 * Renders the probe with the profile already cached and fresh, the way
 * ProfileGate leaves it for the page — and makes that profile the account's.
 */
function renderProbe(profile: MeProfile, queryClient = createQueryClient()) {
  accountProfile = profile;
  queryClient.setQueryData(ME_QUERY_KEY, profile);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TutorialProbe />
    </QueryClientProvider>
  );
  return { ...view, queryClient };
}

function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, retry: false } } });
}

function readCachedProfile(queryClient: QueryClient): MeProfile | undefined {
  return queryClient.getQueryData<MeProfile>(ME_QUERY_KEY);
}

beforeEach(() => {
  vi.mocked(useSession).mockReturnValue({ data: { user: { id: "user-1" } }, isPending: false } as never);
  vi.mocked(fetchMe).mockImplementation(async () => accountProfile);
  vi.mocked(markTutorialSeen).mockImplementation(async (tutorialId) => {
    accountProfile = { ...accountProfile, seenTutorialIds: [...(accountProfile.seenTutorialIds ?? []), tutorialId] };
    return { seen: true };
  });
  vi.mocked(updateMe).mockImplementation(async (params) => {
    accountProfile = { ...accountProfile, ...params };
    return accountProfile;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("usePageTutorial", () => {
  it("opens by itself on a first visit, from the profile already loaded", () => {
    renderProbe(makeProfile());

    expect(screen.getByText("tutorial open")).toBeInTheDocument();
    expect(fetchMe).not.toHaveBeenCalled();
  });

  it("stays closed once this account has seen the tutorial", () => {
    renderProbe(makeProfile({ seenTutorialIds: [TUTORIAL_ID] }));

    expect(screen.getByText("tutorial closed")).toBeInTheDocument();
  });

  it("only counts this tutorial as seen, not another page's", () => {
    renderProbe(makeProfile({ seenTutorialIds: ["player-profile"] }));

    expect(screen.getByText("tutorial open")).toBeInTheDocument();
  });

  it("stays closed, even on a first visit, once the user has chosen Skip all", () => {
    renderProbe(makeProfile({ autoOpenTutorials: false }));

    expect(screen.getByText("tutorial closed")).toBeInTheDocument();
  });

  // An API that predates tutorials sends neither field. Opening anyway would
  // mean opening on every visit, since nothing could record it as seen.
  it("stays closed when the profile carries no tutorial fields at all", () => {
    const profile = makeProfile();
    delete profile.seenTutorialIds;
    delete profile.autoOpenTutorials;

    renderProbe(profile);

    expect(screen.getByText("tutorial closed")).toBeInTheDocument();
  });

  it("stays closed, and records nothing, when there is no profile to decide from", async () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <TutorialProbe />
      </QueryClientProvider>
    );
    expect(screen.getByText("tutorial closed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "replay" }));
    await user.click(screen.getByRole("button", { name: "close: skip-all" }));

    expect(screen.getByText("tutorial closed")).toBeInTheDocument();
    expect(markTutorialSeen).not.toHaveBeenCalled();
    expect(updateMe).not.toHaveBeenCalled();
  });

  it.each(["complete", "skip", "exit"] as const)(
    "marks the tutorial seen on the account when it closes by %s",
    async (reason) => {
      const user = userEvent.setup();
      renderProbe(makeProfile());

      await user.click(screen.getByRole("button", { name: `close: ${reason}` }));

      expect(screen.getByText("tutorial closed")).toBeInTheDocument();
      await waitFor(() => expect(markTutorialSeen).toHaveBeenCalledExactlyOnceWith(TUTORIAL_ID));
      // Only Skip all changes whether other pages' tutorials open.
      expect(updateMe).not.toHaveBeenCalled();
    }
  );

  it("turns tutorials off for every page on Skip all, as well as marking this one seen", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderProbe(makeProfile());

    await user.click(screen.getByRole("button", { name: "close: skip-all" }));

    await waitFor(() => expect(updateMe).toHaveBeenCalledExactlyOnceWith({ autoOpenTutorials: false }));
    expect(markTutorialSeen).toHaveBeenCalledExactlyOnceWith(TUTORIAL_ID);
    await waitFor(() =>
      expect(readCachedProfile(queryClient)).toMatchObject({ seenTutorialIds: [TUTORIAL_ID], autoOpenTutorials: false })
    );
  });

  it("refetches the profile once the write lands, so the cache ends on the account's real state", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderProbe(makeProfile());

    await user.click(screen.getByRole("button", { name: "close: complete" }));

    await waitFor(() => expect(fetchMe).toHaveBeenCalledOnce());
    await waitFor(() => expect(readCachedProfile(queryClient)).toEqual(accountProfile));
    expect(accountProfile.seenTutorialIds).toEqual([TUTORIAL_ID]);
  });

  // Coming back to the page remounts it with nothing but the cache to go on;
  // a PUT still in flight must not let it reopen.
  it("does not reopen when the page is left and revisited before the write has landed", async () => {
    vi.mocked(markTutorialSeen).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const { queryClient, unmount } = renderProbe(makeProfile());

    await user.click(screen.getByRole("button", { name: "close: exit" }));
    await waitFor(() => expect(readCachedProfile(queryClient)?.seenTutorialIds).toEqual([TUTORIAL_ID]));
    unmount();
    renderProbe(readCachedProfile(queryClient) as MeProfile, queryClient);

    expect(screen.getByText("tutorial closed")).toBeInTheDocument();
  });

  // A profile can land between the close and the refetch still saying
  // "unseen" — another tab's GET, say. That must not reopen it mid-visit.
  it("stays closed when a profile that still says unseen lands after the close", async () => {
    vi.mocked(markTutorialSeen).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const { queryClient } = renderProbe(makeProfile());

    await user.click(screen.getByRole("button", { name: "close: exit" }));
    act(() => {
      queryClient.setQueryData(ME_QUERY_KEY, makeProfile());
    });

    expect(screen.getByText("tutorial closed")).toBeInTheDocument();
  });

  // The write is best-effort: a failure costs at most one more showing on a
  // later visit, never a tutorial that won't close now. The refetch after it
  // brings back the account's "unseen", which is the honest state to hold.
  it("stays closed for the rest of the visit when marking it seen fails", async () => {
    vi.mocked(markTutorialSeen).mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    const { queryClient } = renderProbe(makeProfile());

    await user.click(screen.getByRole("button", { name: "close: skip" }));

    await waitFor(() => expect(fetchMe).toHaveBeenCalledOnce());
    await waitFor(() => expect(readCachedProfile(queryClient)?.seenTutorialIds).toEqual([]));
    expect(screen.getByText("tutorial closed")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // A GET sent before the close was answered before the write, so all it can
  // carry is "unseen"; it is cancelled rather than allowed to land on top of
  // the close.
  it("cancels a profile fetch already in flight, so its out-of-date answer never lands", async () => {
    const inFlightFetch = createDeferred<MeProfile>();
    const pendingWrite = createDeferred<{ seen: true }>();
    vi.mocked(fetchMe).mockReturnValueOnce(inFlightFetch.promise);
    vi.mocked(markTutorialSeen).mockReturnValue(pendingWrite.promise);
    const user = userEvent.setup();
    const { queryClient } = renderProbe(makeProfile());
    act(() => {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    });
    await waitFor(() => expect(fetchMe).toHaveBeenCalledOnce());

    await user.click(screen.getByRole("button", { name: "close: exit" }));
    await waitFor(() => expect(markTutorialSeen).toHaveBeenCalled());
    await act(async () => inFlightFetch.resolve(makeProfile()));

    expect(readCachedProfile(queryClient)?.seenTutorialIds).toEqual([TUTORIAL_ID]);
  });

  // The other side of that cancel: a replay of a seen tutorial writes
  // nothing, so it must not cancel a refetch someone else asked for — here,
  // the one a watchlist Remove starts — or that change would be lost.
  it("leaves a profile refetch in flight alone when a replay has nothing to write", async () => {
    const inFlightFetch = createDeferred<MeProfile>();
    vi.mocked(fetchMe).mockReturnValueOnce(inFlightFetch.promise);
    const user = userEvent.setup();
    const { queryClient } = renderProbe(
      makeProfile({ seenTutorialIds: [TUTORIAL_ID], followedPlayers: [PLAYER_ONE, PLAYER_TWO] })
    );
    act(() => {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    });
    await waitFor(() => expect(fetchMe).toHaveBeenCalledOnce());

    await user.click(screen.getByRole("button", { name: "replay" }));
    await user.click(screen.getByRole("button", { name: "close: exit" }));
    await act(async () =>
      inFlightFetch.resolve(makeProfile({ seenTutorialIds: [TUTORIAL_ID], followedPlayers: [PLAYER_TWO] }))
    );

    await waitFor(() => expect(readCachedProfile(queryClient)?.followedPlayers).toEqual([PLAYER_TWO]));
    expect(markTutorialSeen).not.toHaveBeenCalled();
  });

  it("replays on demand after it has been seen, without writing it as seen again", async () => {
    const user = userEvent.setup();
    renderProbe(makeProfile({ seenTutorialIds: [TUTORIAL_ID] }));

    await user.click(screen.getByRole("button", { name: "replay" }));
    expect(screen.getByText("tutorial open")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "close: complete" }));
    expect(screen.getByText("tutorial closed")).toBeInTheDocument();
    expect(markTutorialSeen).not.toHaveBeenCalled();
  });

  it("replays even after Skip all, and skipping all again sends nothing new", async () => {
    const user = userEvent.setup();
    renderProbe(makeProfile({ seenTutorialIds: [TUTORIAL_ID], autoOpenTutorials: false }));

    await user.click(screen.getByRole("button", { name: "replay" }));
    expect(screen.getByText("tutorial open")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "close: skip-all" }));
    expect(screen.getByText("tutorial closed")).toBeInTheDocument();
    expect(markTutorialSeen).not.toHaveBeenCalled();
    expect(updateMe).not.toHaveBeenCalled();
  });
});
