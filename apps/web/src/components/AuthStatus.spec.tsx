import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStatus } from "./AuthStatus";
import { signInWithGoogle, useSession } from "@/lib/authClient";
import { fetchMe } from "@/lib/meApi";
import type { MeProfile } from "@/types/nba";

vi.mock("@/lib/authClient", () => ({
  signInWithGoogle: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("@/lib/meApi", () => ({
  fetchMe: vi.fn(),
}));

function renderWithProviders(signInCallbackURL?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthStatus signInCallbackURL={signInCallbackURL} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const ME: MeProfile = {
  id: "user-1",
  email: "player@example.com",
  name: "Player One",
  username: "playerone",
  avatarUrl: null,
  favoriteTeam: null,
  followedPlayers: [],
  role: "USER",
};

describe("AuthStatus", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a skeleton while the session is pending", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: true } as never);

    const { container } = renderWithProviders();

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("renders a Google sign-in button when there is no session", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);

    renderWithProviders();

    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
  });

  it("starts the Google sign-in flow when the sign-in button is clicked", async () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);
    const user = userEvent.setup();

    renderWithProviders();
    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("uses the supplied callback for Google sign-in", async () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);
    const user = userEvent.setup();
    const signInCallbackURL = "http://localhost:3000/home";

    renderWithProviders(signInCallbackURL);
    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(signInWithGoogle).toHaveBeenCalledWith(signInCallbackURL);
  });

  it("links to /profile with the username and avatar once signed in", async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: "player@example.com", name: "Player One" } },
      isPending: false,
    } as never);
    vi.mocked(fetchMe).mockResolvedValue(ME);

    renderWithProviders();

    const link = await screen.findByRole("link", { name: "playerone" });
    expect(link).toHaveAttribute("href", "/profile");
  });

  it("falls back to the session's name before GET /v1/me has resolved", () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: "player@example.com", name: "Player One" } },
      isPending: false,
    } as never);
    vi.mocked(fetchMe).mockReturnValue(new Promise(() => {})); // never resolves in this test

    renderWithProviders();

    expect(screen.getByRole("link", { name: "Player One" })).toBeInTheDocument();
  });

  it("shows an avatar image when the profile has one", async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: "player@example.com", name: "Player One" } },
      isPending: false,
    } as never);
    vi.mocked(fetchMe).mockResolvedValue({ ...ME, avatarUrl: "https://signed.example.com/avatar.png" });

    renderWithProviders();
    const link = await screen.findByRole("link", { name: "playerone" });

    const image = link.querySelector("img");
    expect(image).toHaveAttribute("src", "https://signed.example.com/avatar.png");
  });

  it("falls back to an initial when there is no avatar", async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: "player@example.com", name: "Player One" } },
      isPending: false,
    } as never);
    vi.mocked(fetchMe).mockResolvedValue(ME);

    renderWithProviders();
    const link = await screen.findByRole("link", { name: "playerone" });

    expect(link.textContent).toContain("P");
  });
});
