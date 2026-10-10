import type { ExecutionContext } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OptionalSessionGuard } from "./optional-session.guard.js";
import { auth } from "../auth/auth.config.js";

vi.mock("../auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const getSession = vi.mocked(auth.api.getSession);

function createContext(): { context: ExecutionContext; request: Record<string, unknown> } {
  const request: Record<string, unknown> = { headers: { cookie: "session=abc" } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe("OptionalSessionGuard", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("attaches the session user and passes when a valid session is present", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1" } } as never);
    const guard = new OptionalSessionGuard();
    const { context, request } = createContext();

    expect(await guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual({ id: "user-1" });
  });

  it("passes without attaching a user when there is no session", async () => {
    getSession.mockResolvedValue(null);
    const guard = new OptionalSessionGuard();
    const { context, request } = createContext();

    expect(await guard.canActivate(context)).toBe(true);
    expect(request.user).toBeUndefined();
  });
});
