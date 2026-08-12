import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "./AppLayout";
import { useSession } from "@/lib/authClient";
import { renderWithProviders } from "@/test/renderWithProviders";

// Sidebar -> AuthStatus -> useSession would otherwise hit the network.
vi.mock("@/lib/authClient", () => ({
  authClient: { signIn: { social: vi.fn() }, signOut: vi.fn() },
  useSession: vi.fn(),
}));

function renderAt(path: string) {
  vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);

  return renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/home" element={<p>dashboard content</p>} />
        <Route path="/players" element={<p>players content</p>} />
        <Route path="/players/:playerId" element={<p>player detail</p>} />
      </Route>
    </Routes>,
    [path]
  );
}

describe("AppLayout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the matched route inside the main region", () => {
    renderAt("/home");

    expect(within(screen.getByRole("main")).getByText("dashboard content")).toBeInTheDocument();
  });

  it("keeps the sidebar alongside every routed page", () => {
    renderAt("/players");

    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByText("players content")).toBeInTheDocument();
  });

  it("points the sidebar Home link at the relocated dashboard", () => {
    renderAt("/home");

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/home");
  });

  // These three together guard the removal of NavLink's `end` prop.
  it("marks the sidebar Home link active on /home", () => {
    renderAt("/home");

    expect(screen.getByRole("link", { name: "Home" }).className).toContain("text-brand-accent");
  });

  it("does not mark Home active on a sibling dashboard route", () => {
    renderAt("/players");

    expect(screen.getByRole("link", { name: "Home" }).className).toContain("text-text-secondary");
  });

  it("keeps Players active on a player detail route", () => {
    renderAt("/players/abc-123");

    expect(screen.getByRole("link", { name: "Players" }).className).toContain("text-brand-accent");
  });
});
