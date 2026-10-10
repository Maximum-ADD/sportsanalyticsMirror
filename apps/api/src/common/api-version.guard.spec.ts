import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ApiException } from "./api-exception.js";
import { ApiVersionGuard } from "./api-version.guard.js";

function createContext(path: string, requestedVersion?: string) {
  const response = { setHeader: vi.fn() };
  const context = { switchToHttp: () => ({ getRequest: () => ({ path, headers: { "accept-version": requestedVersion } }), getResponse: () => response }) } as unknown as ExecutionContext;
  return { context, response };
}

describe("ApiVersionGuard", () => {
  it("accepts version 1 requests and states the served version", () => {
    const { context, response } = createContext("/v1/players", "1");
    expect(new ApiVersionGuard().canActivate(context)).toBe(true);
    expect(response.setHeader).toHaveBeenCalledWith("API-Version", "1");
  });

  it("rejects an unsupported requested version", () => {
    const { context } = createContext("/v1/players", "2");
    expect(() => new ApiVersionGuard().canActivate(context)).toThrow(ApiException);
  });
});
