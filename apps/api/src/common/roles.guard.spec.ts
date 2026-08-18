import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiException } from "./api-exception.js";
import { RolesGuard } from "./roles.guard.js";

function createContext(user: { role: Role } | undefined): ExecutionContext {
  return {
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function createReflector(allowedRoles: Role[] | undefined): Reflector {
  return {
    getAllAndOverride: () => allowedRoles,
  } as unknown as Reflector;
}

describe("RolesGuard", () => {
  let context: ExecutionContext;

  beforeEach(() => {
    context = createContext({ role: "USER" });
  });

  it("allows the request through when the handler has no @Roles() metadata", () => {
    const guard = new RolesGuard(createReflector(undefined));
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows the request through when @Roles() is an empty array", () => {
    const guard = new RolesGuard(createReflector([]));
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows the request when request.user has one of the allowed roles", () => {
    const guard = new RolesGuard(createReflector(["USER", "ADMIN"]));
    expect(guard.canActivate(context)).toBe(true);
  });

  it("throws a 403 ApiException when request.user's role isn't allowed", () => {
    const guard = new RolesGuard(createReflector(["ADMIN"]));
    expect(() => guard.canActivate(context)).toThrow(ApiException);
  });

  it("throws a 403 ApiException when there is no request.user at all", () => {
    const guard = new RolesGuard(createReflector(["ADMIN"]));
    const unauthenticatedContext = createContext(undefined);
    expect(() => guard.canActivate(unauthenticatedContext)).toThrow(ApiException);
  });
});
