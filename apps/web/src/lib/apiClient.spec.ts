import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  fetchJson,
  pingHealth,
  postFormData,
  sendJson,
} from "./apiClient";

describe("apiClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches JSON and includes credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await expect(fetchJson<{ ok: boolean }>("/v1/health")).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith("/api/v1/health", { credentials: "include" });
  });

  it("throws an ApiError for failed reads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 503 }));

    await expect(fetchJson("/v1/health")).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
      message: "Request to /v1/health failed with status 503",
    });
  });

  it("sends JSON bodies for POST and PATCH requests", async () => {
    const fetch_mock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ saved: true }), { status: 200 }),
    );

    await expect(sendJson("/v1/items", "POST", { name: "one" })).resolves.toEqual({ saved: true });
    await expect(sendJson("/v1/items/1", "PATCH", { name: "two" })).resolves.toEqual({ saved: true });

    expect(fetch_mock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/items",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "one" }),
      }),
    );
    expect(fetch_mock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/items/1",
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("sends a bodyless DELETE request", async () => {
    const fetch_mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ deleted: true }), { status: 200 }));

    await expect(sendJson("/v1/items/1", "DELETE")).resolves.toEqual({ deleted: true });
    expect(fetch_mock).toHaveBeenCalledWith("/api/v1/items/1", {
      method: "DELETE",
      credentials: "include",
    });
  });

  it("sends multipart form data without overriding the boundary", async () => {
    const fetch_mock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ uploaded: true }), { status: 200 }),
    );
    const form_data = new FormData();
    form_data.append("avatar", new Blob(["image"]), "avatar.png");

    await expect(postFormData("/v1/me/avatar", form_data)).resolves.toEqual({ uploaded: true });
    expect(fetch_mock).toHaveBeenCalledWith("/api/v1/me/avatar", {
      method: "POST",
      credentials: "include",
      body: form_data,
    });
  });

  it("uses the API error message when a write returns the standard envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Already saved" } }), { status: 409 }),
    );

    await expect(sendJson("/v1/items", "POST", {})).rejects.toEqual(
      new ApiError("Already saved", 409),
    );
  });

  it("falls back when a write returns malformed or empty error data", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: {} }), { status: 400 }))
      .mockResolvedValueOnce(new Response("not json", { status: 502 }));

    await expect(sendJson("/v1/items", "POST", {})).rejects.toMatchObject({
      message: "Request to /v1/items failed with status 400",
    });
    await expect(sendJson("/v1/items", "POST", {})).rejects.toMatchObject({
      message: "Request to /v1/items failed with status 502",
    });
  });

  it("warms the health endpoint without propagating network errors", () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    expect(() => pingHealth()).not.toThrow();
    expect(fetch).toHaveBeenCalledWith("/api/health", { credentials: "include" });
  });
});
