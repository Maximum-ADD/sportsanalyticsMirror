import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiKeysPage } from "./ApiKeysPage";
import {
  createMyApiKey,
  deleteMyApiKey,
  fetchMyApiKeys,
  revokeMyApiKey,
} from "@/lib/meApi";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/lib/meApi", () => ({
  fetchMyApiKeys: vi.fn(),
  createMyApiKey: vi.fn(),
  revokeMyApiKey: vi.fn(),
  deleteMyApiKey: vi.fn(),
}));

const CONSUMER = { id: "c1", rateLimit: 60, dailyQuota: 5000, usageCount: 42 };

function makeKey(overrides: Record<string, unknown> = {}) {
  return {
    id: "k1",
    label: "laptop",
    isActive: true,
    lastUsedAt: null,
    createdAt: "2026-09-10T12:00:00.000Z",
    ...overrides,
  };
}

describe("ApiKeysPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    vi.mocked(fetchMyApiKeys).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ApiKeysPage />);
    expect(screen.getByRole("status", { name: "Loading API keys" })).toBeInTheDocument();
  });

  it("shows error state on fetch failure", async () => {
    vi.mocked(fetchMyApiKeys).mockRejectedValue(new Error("fail"));
    renderWithProviders(<ApiKeysPage />);
    expect(await screen.findByText("Could not load API keys.")).toBeInTheDocument();
  });

  it("shows empty state before the user has any keys", async () => {
    vi.mocked(fetchMyApiKeys).mockResolvedValue({ consumer: null, keys: [] });
    renderWithProviders(<ApiKeysPage />);
    expect(
      await screen.findByText("No API keys yet — generate one above to get started.")
    ).toBeInTheDocument();
    // the personal consumer is only provisioned on first key, so no usage line yet
    expect(screen.queryByText(/Usage across all your keys/)).not.toBeInTheDocument();
  });

  it("lists keys with status, fallback labels, and the usage line", async () => {
    vi.mocked(fetchMyApiKeys).mockResolvedValue({
      consumer: CONSUMER,
      keys: [
        makeKey(),
        makeKey({ id: "k2", label: null, isActive: false, lastUsedAt: "2026-09-12T09:30:00.000Z" }),
      ],
    });
    renderWithProviders(<ApiKeysPage />);

    expect(await screen.findByText("laptop")).toBeInTheDocument();
    // unlabeled keys fall back to a readable slice of their id
    expect(screen.getByText("Key k2")).toBeInTheDocument();
    expect(screen.getByText("● Active")).toBeInTheDocument();
    expect(screen.getByText("○ Revoked")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText(/Usage across all your keys: 42 requests/)).toBeInTheDocument();
    // revoked keys lose their Revoke button; Delete is always available
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(2);
  });

  it("generates a key, shows it once, and dismisses it", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMyApiKeys).mockResolvedValue({ consumer: null, keys: [] });
    vi.mocked(createMyApiKey).mockResolvedValue({
      id: "k9", label: "laptop", rawKey: "nba_rawsecret", createdAt: "2026-09-17",
    });
    renderWithProviders(<ApiKeysPage />);

    await user.type(screen.getByLabelText("Key label"), "  laptop  ");
    await user.click(screen.getByRole("button", { name: "Generate Key" }));

    await waitFor(() => expect(createMyApiKey).toHaveBeenCalledWith("laptop"));
    expect(await screen.findByText("nba_rawsecret")).toBeInTheDocument();
    expect(screen.getByText(/copy now — shown only once/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("nba_rawsecret")).not.toBeInTheDocument();
  });

  it("sends no label when the input is blank", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMyApiKeys).mockResolvedValue({ consumer: null, keys: [] });
    vi.mocked(createMyApiKey).mockResolvedValue({
      id: "k9", label: null, rawKey: "nba_rawsecret", createdAt: "2026-09-17",
    });
    renderWithProviders(<ApiKeysPage />);

    await screen.findByText("No API keys yet — generate one above to get started.");
    await user.click(screen.getByRole("button", { name: "Generate Key" }));

    await waitFor(() => expect(createMyApiKey).toHaveBeenCalledWith(undefined));
  });

  it("shows an error when generation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMyApiKeys).mockResolvedValue({ consumer: null, keys: [] });
    vi.mocked(createMyApiKey).mockRejectedValue(new Error("fail"));
    renderWithProviders(<ApiKeysPage />);

    await screen.findByText("No API keys yet — generate one above to get started.");
    await user.click(screen.getByRole("button", { name: "Generate Key" }));

    expect(await screen.findByText("Failed to generate key")).toBeInTheDocument();
  });

  it("revokes an active key", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMyApiKeys).mockResolvedValue({ consumer: CONSUMER, keys: [makeKey()] });
    vi.mocked(revokeMyApiKey).mockResolvedValue({ revoked: true });
    renderWithProviders(<ApiKeysPage />);

    await screen.findByText("laptop");
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(revokeMyApiKey).toHaveBeenCalledWith("k1"));
  });

  it("deletes a key", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMyApiKeys).mockResolvedValue({ consumer: CONSUMER, keys: [makeKey()] });
    vi.mocked(deleteMyApiKey).mockResolvedValue({ deleted: true });
    renderWithProviders(<ApiKeysPage />);

    await screen.findByText("laptop");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteMyApiKey).toHaveBeenCalledWith("k1"));
  });
});
