import type { ExecutionContext } from "@nestjs/common";
import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ApiException } from "./api-exception.js";
import { OriginCheckGuard } from "./origin-check.guard.js";

// The real list is read from WEB_ORIGIN at import time; pinning it here keeps
// the spec independent of whatever .env.test happens to say.
vi.mock("./allowed-origins.js", () => ({
  allowedOrigins: ["https://app.example", "http://localhost:5173"],
}));

function createContext(method: string, origin?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, headers: origin ? { origin } : {} }),
    }),
  } as unknown as ExecutionContext;
}

describe("OriginCheckGuard", () => {
  const guard = new OriginCheckGuard();

  it("allows safe methods regardless of Origin", () => {
    expect(guard.canActivate(createContext("GET", "https://evil.example"))).toBe(true);
    expect(guard.canActivate(createContext("HEAD", "https://evil.example"))).toBe(true);
    expect(guard.canActivate(createContext("OPTIONS", "https://evil.example"))).toBe(true);
  });

  it("allows a state-changing request from an allowed Origin", () => {
    expect(guard.canActivate(createContext("POST", "https://app.example"))).toBe(true);
    expect(guard.canActivate(createContext("DELETE", "http://localhost:5173"))).toBe(true);
  });

  it("allows a state-changing request with no Origin at all (non-browser caller)", () => {
    expect(guard.canActivate(createContext("POST"))).toBe(true);
  });

  it("rejects a state-changing request from an untrusted Origin", () => {
    expect(() => guard.canActivate(createContext("POST", "https://evil.example"))).toThrow(ApiException);
    expect(() => guard.canActivate(createContext("PATCH", "https://evil.example"))).toThrow(ApiException);
    expect(() => guard.canActivate(createContext("DELETE", "https://evil.example"))).toThrow(ApiException);
  });

  it("rejects with a 403 FORBIDDEN envelope naming the offending Origin", () => {
    try {
      guard.canActivate(createContext("POST", "https://evil.example"));
      throw new Error("Expected the guard to reject the request");
    } catch (error) {
      const apiException = error as ApiException;
      const body = apiException.getResponse() as { error: { code: string; message: string } };
      expect(apiException.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("https://evil.example");
    }
  });

  it("treats an Origin that only differs by port or scheme as untrusted", () => {
    expect(() => guard.canActivate(createContext("POST", "http://localhost:5174"))).toThrow(ApiException);
    expect(() => guard.canActivate(createContext("POST", "http://app.example"))).toThrow(ApiException);
  });
});
