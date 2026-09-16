import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

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
