import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "./ProtectedRoute";
import { signInWithGoogle, useSession } from "@/lib/authClient";

vi.mock("@/lib/authClient", () => ({
  signInWithGoogle: vi.fn(),
  useSession: vi.fn(),
}));

describe("ProtectedRoute", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading placeholder while the session is pending", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: true } as never);

    render(<ProtectedRoute>Protected content</ProtectedRoute>);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("prompts logged-out visitors to sign in", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);

    render(<ProtectedRoute>Protected content</ProtectedRoute>);

    expect(screen.getByRole("heading", { name: "Sign in required" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("starts sign-in with the attempted page as the callback", async () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);
    const user = userEvent.setup();

    render(<ProtectedRoute>Protected content</ProtectedRoute>);
    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(signInWithGoogle).toHaveBeenCalledWith(window.location.href);
  });

  it("renders protected content for a signed-in visitor", () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: "player@example.com" } },
      isPending: false,
    } as never);

    render(<ProtectedRoute>Protected content</ProtectedRoute>);

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });
});
