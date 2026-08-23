import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { fetchGames } from "@/lib/nbaApi";

vi.mock("@/lib/nbaApi", () => ({
  fetchGames: vi.fn(),
}));

vi.mock("@/lib/authClient", () => ({
  authClient: { signIn: { social: vi.fn() }, signOut: vi.fn() },
  useSession: () => ({ data: null, isPending: false }),
}));

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, "", "/");
});

describe("routing", () => {
  it('serves the landing page at "/", without the app navbar', () => {
    vi.mocked(fetchGames).mockResolvedValue({ data: [], page: 1, pageSize: 1, total: 0 });

    renderAt("/");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Fantasy League/);

    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toHaveTextContent(
      "Predictions"
    );
  });

  it('serves the app home at "/home", inside the app shell', () => {
    vi.mocked(fetchGames).mockResolvedValue({ data: [], page: 1, pageSize: 1, total: 0 });

    renderAt("/home");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Sports\s*Analytics/);
    expect(screen.getByRole("link", { name: "Predictions" })).toHaveAttribute(
      "href",
      "/predictions"
    );
  });

  it("keeps the app navbar's Home link inside the app, not out on the landing page", () => {
    vi.mocked(fetchGames).mockResolvedValue({ data: [], page: 1, pageSize: 1, total: 0 });

    renderAt("/home");

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/home");
  });
});
