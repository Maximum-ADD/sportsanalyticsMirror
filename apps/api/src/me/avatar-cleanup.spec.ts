import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { deleteUserAvatars } from "./avatar-cleanup.js";

function createStorageClient(opts: { stored?: string[]; listError?: Error; removeError?: Error } = {}) {
  const list = vi.fn().mockResolvedValue({
    data: (opts.stored ?? []).map((name) => ({ name })),
    error: opts.listError ?? null,
  });
  const remove = vi.fn().mockResolvedValue({ data: [], error: opts.removeError ?? null });
  const from = vi.fn().mockReturnValue({ list, remove });
  const client = { storage: { from } } as unknown as SupabaseClient;
  return { client, from, list, remove };
}

describe("deleteUserAvatars", () => {
  it("removes every object in the deleted user's folder", async () => {
    const { client, from, list, remove } = createStorageClient({ stored: ["current.png", "orphan.jpg"] });

    await deleteUserAvatars("user-1", client);

    expect(from).toHaveBeenCalledWith("profile pictures");
    expect(list).toHaveBeenCalledWith("user-1", expect.objectContaining({ limit: expect.any(Number) }));
    expect(remove).toHaveBeenCalledWith(["user-1/current.png", "user-1/orphan.jpg"]);
  });

  it("does nothing more when the user never uploaded a photo", async () => {
    const { client, remove } = createStorageClient({ stored: [] });

    await deleteUserAvatars("user-1", client);

    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    ["listing", { listError: new Error("storage down") }],
    ["removing", { stored: ["current.png"], removeError: new Error("storage down") }],
  ])("logs instead of throwing when %s fails, since the account is already gone", async (_step, opts) => {
    const { client } = createStorageClient(opts);

    await expect(deleteUserAvatars("user-1", client)).resolves.toBeUndefined();
  });
});
