import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStatus } from "./AuthStatus";
import { authClient, signInWithGoogle, useSession } from "@/lib/authClient";

vi.mock("@/lib/authClient", () => ({
  authClient: {
    signOut: vi.fn(),
  },
  signInWithGoogle: vi.fn(),
  useSession: vi.fn(),
}));

describe("AuthStatus", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a skeleton while the session is pending", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: true } as never);

    const { container } = render(<AuthStatus />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("renders a Google sign-in button when there is no session", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);

    render(<AuthStatus />);

    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
  });

  it("starts the Google sign-in flow when the sign-in button is clicked", async () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);
    const user = userEvent.setup();

    render(<AuthStatus />);
    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("shows the signed-in user's email and a sign-out button when a session exists", () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: "player@example.com" } },
      isPending: false,
    } as never);

    render(<AuthStatus />);

    expect(screen.getByText("player@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("signs out when the sign-out button is clicked", async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: "player@example.com" } },
      isPending: false,
    } as never);
    const user = userEvent.setup();

    render(<AuthStatus />);
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(authClient.signOut).toHaveBeenCalledTimes(1);
  });
});
