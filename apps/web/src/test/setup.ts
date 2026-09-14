import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// The CI runner is resource-constrained — mocked promises and React
// re-renders can take several seconds. Bump the testing-library async
// timeout so findBy* queries don't give up while skeletons are showing.
configure({ asyncUtilTimeout: 10_000 });
