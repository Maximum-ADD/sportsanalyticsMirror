import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCountUp } from "./useCountUp";

describe("useCountUp", () => {
  it("holds at zero while inactive", () => {
    const { result } = renderHook(() => useCountUp(69, false));

    expect(result.current).toBe(0);
  });

  it("settles on the target once active", async () => {
    // Whether the environment animates (rAF present) or snaps (no rAF), the
    // count must reach exactly the target and stop there.
    const { result, rerender } = renderHook(({ active }) => useCountUp(69, active), {
      initialProps: { active: false },
    });
    expect(result.current).toBe(0);

    rerender({ active: true });

    await waitFor(() => expect(result.current).toBe(69));
  });

  it("rewinds to zero when deactivated, so a re-entry counts up from the top", async () => {
    const { result, rerender } = renderHook(({ active }) => useCountUp(69, active), {
      initialProps: { active: false },
    });

    rerender({ active: true });
    await waitFor(() => expect(result.current).toBe(69));

    rerender({ active: false });

    expect(result.current).toBe(0);
  });
});
