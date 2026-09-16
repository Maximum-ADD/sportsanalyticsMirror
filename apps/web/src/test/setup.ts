import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { vi } from "vitest";

// The real better-auth client (src/lib/authClient.ts's module-level
// createAuthClient() call) sets up a nanostores-backed session store with
// its own background refresh timer and a BroadcastChannel for cross-tab
// sync. Any spec file that doesn't mock @/lib/authClient itself — most
// don't need to, since they don't touch auth — instantiates that real
// client anyway just by importing a component that transitively pulls in
// useSession (useMe, AuthStatus, ProtectedRoute, etc.). Its internal timer
// can outlive that file's own jsdom teardown, especially under CI's
// resource-constrained concurrent test run, and firing afterwards throws
// "ReferenceError: window is not defined" from deep inside better-auth,
// attributed by Vitest to whichever file happens to be running at that
// moment rather than the one that actually created it. A file that
// legitimately needs to test real client behavior (authClient.spec.ts)
// still gets it: a vi.mock for the same module inside that file overrides
// this default for that file only.
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null, refetch: vi.fn() }),
    signIn: { social: vi.fn() },
    signOut: vi.fn(),
    deleteUser: vi.fn(),
  }),
}));

// The CI runner is resource-constrained — mocked promises and React
// re-renders can take several seconds. Bump the testing-library async
// timeout so findBy* queries don't give up while skeletons are showing.
// 10s wasn't always enough: a real (unmocked) debounce chain — type, wait
// 300ms, resolve a mocked fetch, render, findByRole the result, click —
// hit it under heavy concurrent load (this project's test files aren't
// pinned to a single worker the way apps/api's are, so many run at once)
// and failed with zero calls recorded, not a slow-but-eventual pass.
// Raised to sit just under vite.config.ts's 30s per-test testTimeout,
// leaving headroom for a genuinely hung test to still fail outright.
configure({ asyncUtilTimeout: 25_000 });
