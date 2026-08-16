import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins plain class name strings", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", undefined, false, null, "b")).toBe("a b");
  });

  it("merges conflicting Tailwind classes, keeping the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("applies conditional object syntax from clsx", () => {
    expect(cn({ a: true, b: false }, "c")).toBe("a c");
  });
});
