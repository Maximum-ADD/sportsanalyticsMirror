import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCurrentTime } from "./useCurrentTime";

const START = new Date("2026-10-06T19:00:00Z");

describe("useCurrentTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at the current time and re-reads it every interval", () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    const { result } = renderHook(() => useCurrentTime(30_000));

    expect(result.current).toBe(START.getTime());
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(result.current).toBe(START.getTime());
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(START.getTime() + 30_000);
  });

  it("stops its timer when the component unmounts", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useCurrentTime(30_000));

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
