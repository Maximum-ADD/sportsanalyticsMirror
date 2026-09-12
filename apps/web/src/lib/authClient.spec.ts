import { afterEach, describe, expect, it, vi } from "vitest";

const social = vi.fn();

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({ signIn: { social } }),
}));

describe("signInWithGoogle", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("starts a Google sign-in defaulting the callback to the current URL", async () => {
    const { signInWithGoogle } = await import("./authClient");

    signInWithGoogle();

    expect(social).toHaveBeenCalledWith({ provider: "google", callbackURL: window.location.href });
  });

  it("lets a caller override the callback URL", async () => {
    const { signInWithGoogle } = await import("./authClient");

    signInWithGoogle("/players");

    expect(social).toHaveBeenCalledWith({ provider: "google", callbackURL: "/players" });
  });
});
