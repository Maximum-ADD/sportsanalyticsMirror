import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../picks/authenticated-request.js";
import { MeApiKeysController } from "./me-api-keys.controller.js";

function createMockService() {
  return {
    listMyApiKeys: vi.fn().mockResolvedValue({ consumer: null, keys: [] }),
    createApiKey: vi.fn().mockResolvedValue({
      id: "k1",
      label: null,
      rawKey: "nba_test_raw_key",
      createdAt: new Date("2026-09-17T00:00:00.000Z"),
    }),
    revokeApiKey: vi.fn().mockResolvedValue(true),
    deleteApiKey: vi.fn().mockResolvedValue(true),
  };
}

const REQUEST = { user: { id: "u1" } } as AuthenticatedRequest;

describe("MeApiKeysController", () => {
  it("lists keys for the session user", async () => {
    const service = createMockService();
    const controller = new MeApiKeysController(service);

    await controller.listMyKeys(REQUEST);

    expect(service.listMyApiKeys).toHaveBeenCalledWith("u1");
  });

  it("creates a key with the parsed label", async () => {
    const service = createMockService();
    const controller = new MeApiKeysController(service);

    await controller.createKey(REQUEST, { label: "  laptop  " });

    expect(service.createApiKey).toHaveBeenCalledWith("u1", "laptop");
  });

  it("creates a key without a label when none is given", async () => {
    const service = createMockService();
    const controller = new MeApiKeysController(service);

    await controller.createKey(REQUEST, {});

    expect(service.createApiKey).toHaveBeenCalledWith("u1", undefined);
  });

  it("ignores unknown body keys instead of passing them through", async () => {
    const service = createMockService();
    const controller = new MeApiKeysController(service);

    await controller.createKey(REQUEST, { label: "x", rateLimit: 99999, consumerId: "c-evil" });

    expect(service.createApiKey).toHaveBeenCalledWith("u1", "x");
  });

  it("rejects a body whose label is not a string", async () => {
    const service = createMockService();
    const controller = new MeApiKeysController(service);

    await expect(controller.createKey(REQUEST, { label: 42 })).rejects.toMatchObject({ status: 400 });
    expect(service.createApiKey).not.toHaveBeenCalled();
  });

  it("revokes a key and reports success", async () => {
    const service = createMockService();
    const controller = new MeApiKeysController(service);

    await expect(controller.revokeKey(REQUEST, "k1")).resolves.toEqual({ revoked: true });
    expect(service.revokeApiKey).toHaveBeenCalledWith("u1", "k1");
  });

  it("throws 404 when revoking a key that is not the user's", async () => {
    const service = createMockService();
    service.revokeApiKey.mockResolvedValue(false);
    const controller = new MeApiKeysController(service);

    await expect(controller.revokeKey(REQUEST, "k9")).rejects.toMatchObject({ status: 404 });
  });

  it("purges a key and reports success", async () => {
    const service = createMockService();
    const controller = new MeApiKeysController(service);

    await expect(controller.deleteKey(REQUEST, "k1")).resolves.toEqual({ deleted: true });
    expect(service.deleteApiKey).toHaveBeenCalledWith("u1", "k1");
  });

  it("throws 404 when purging a key that is not the user's", async () => {
    const service = createMockService();
    service.deleteApiKey.mockResolvedValue(false);
    const controller = new MeApiKeysController(service);

    await expect(controller.deleteKey(REQUEST, "k9")).rejects.toMatchObject({ status: 404 });
  });
});
