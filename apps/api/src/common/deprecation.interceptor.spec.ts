import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { DeprecationInterceptor } from "./deprecation.interceptor.js";

const DEPRECATION_NOTICE = { replacementPath: "/v1/health", sunsetAt: "2027-03-31T00:00:00.000Z" };

function createContext(response: { setHeader: ReturnType<typeof vi.fn> }): ExecutionContext {
  return {
    getHandler: () => createContext,
    getClass: () => DeprecationInterceptor,
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ExecutionContext;
}

describe("DeprecationInterceptor", () => {
  it("adds lifecycle headers for an explicitly deprecated endpoint", () => {
    const response = { setHeader: vi.fn() };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(DEPRECATION_NOTICE) } as unknown as Reflector;
    const next = { handle: vi.fn().mockReturnValue(of(null)) } as unknown as CallHandler;

    new DeprecationInterceptor(reflector).intercept(createContext(response), next).subscribe();

    expect(response.setHeader).toHaveBeenCalledWith("Deprecation", "@1806451200");
    expect(response.setHeader).toHaveBeenCalledWith("Sunset", "Wed, 31 Mar 2027 00:00:00 GMT");
    expect(response.setHeader).toHaveBeenCalledWith("Link", "</v1/health>; rel=\"successor-version\"");
    expect(next.handle).toHaveBeenCalledOnce();
  });

  it("leaves routes without a deprecation notice unchanged", () => {
    const response = { setHeader: vi.fn() };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const next = { handle: vi.fn().mockReturnValue(of(null)) } as unknown as CallHandler;

    new DeprecationInterceptor(reflector).intercept(createContext(response), next).subscribe();

    expect(response.setHeader).not.toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalledOnce();
  });
});
