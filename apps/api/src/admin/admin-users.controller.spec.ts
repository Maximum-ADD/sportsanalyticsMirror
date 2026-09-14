import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiException } from "../common/api-exception.js";
import { AdminUsersController, parseRoleBody } from "./admin-users.controller.js";
import type { AdminUsersService } from "./admin-users.service.js";

function makeRequest(callerId = "admin-1"): Request {
  return { user: { id: callerId } } as unknown as Request;
}

const OTHER_USER = { id: "user-2", email: "other@example.com", name: "Other", username: null, role: "USER" as const, createdAt: new Date() };

describe("parseRoleBody", () => {
  it.each(["PUBLIC", "USER", "ANALYST", "ADMIN"] as const)("accepts %s", (role) => {
    expect(parseRoleBody({ role })).toBe(role);
  });

  it.each([
    ["a non-object body", "nope"],
    ["a null body", null],
    ["a missing role", {}],
    ["a role outside the enum", { role: "SUPERUSER" }],
    ["a non-string role", { role: 1 }],
  ])("rejects %s with a 400", (_label, body) => {
    expect(() => parseRoleBody(body)).toThrow(ApiException);
  });
});

describe("AdminUsersController", () => {
  let adminUsersService: {
    listUsers: ReturnType<typeof vi.fn>;
    getUserById: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
    updateRole: ReturnType<typeof vi.fn>;
  };
  let controller: AdminUsersController;

  beforeEach(() => {
    adminUsersService = {
      listUsers: vi.fn(),
      getUserById: vi.fn(),
      deleteUser: vi.fn(),
      updateRole: vi.fn(),
    };
    controller = new AdminUsersController(adminUsersService as unknown as AdminUsersService);
  });

  it("lists users, passing the raw query straight through", async () => {
    adminUsersService.listUsers.mockResolvedValue({ data: [], page: 1, pageSize: 25, total: 0 });

    await controller.listUsers({ search: "leb" });

    expect(adminUsersService.listUsers).toHaveBeenCalledWith({ search: "leb" });
  });

  describe("deleteUser", () => {
    it("refuses to delete your own account, without ever calling the service", async () => {
      await expect(controller.deleteUser(makeRequest("admin-1"), "admin-1")).rejects.toThrow(ApiException);
      expect(adminUsersService.getUserById).not.toHaveBeenCalled();
      expect(adminUsersService.deleteUser).not.toHaveBeenCalled();
    });

    it("404s when the target user doesn't exist", async () => {
      adminUsersService.getUserById.mockResolvedValue(null);

      await expect(controller.deleteUser(makeRequest("admin-1"), "user-2")).rejects.toThrow(ApiException);
      expect(adminUsersService.deleteUser).not.toHaveBeenCalled();
    });

    it("deletes a different user and reports success", async () => {
      adminUsersService.getUserById.mockResolvedValue(OTHER_USER);

      const result = await controller.deleteUser(makeRequest("admin-1"), "user-2");

      expect(adminUsersService.deleteUser).toHaveBeenCalledWith("user-2");
      expect(result).toEqual({ deleted: true });
    });
  });

  describe("updateRole", () => {
    it("rejects a malformed body before the service ever sees it", async () => {
      await expect(controller.updateRole(makeRequest(), "user-2", { role: "SUPERUSER" })).rejects.toThrow(
        ApiException
      );
      expect(adminUsersService.updateRole).not.toHaveBeenCalled();
    });

    it("refuses to demote your own account", async () => {
      await expect(controller.updateRole(makeRequest("admin-1"), "admin-1", { role: "USER" })).rejects.toThrow(
        ApiException
      );
      expect(adminUsersService.updateRole).not.toHaveBeenCalled();
    });

    it("allows re-affirming your own ADMIN role (not a demotion)", async () => {
      adminUsersService.getUserById.mockResolvedValue({ ...OTHER_USER, id: "admin-1", role: "ADMIN" });
      adminUsersService.updateRole.mockResolvedValue({ ...OTHER_USER, id: "admin-1", role: "ADMIN" });

      await controller.updateRole(makeRequest("admin-1"), "admin-1", { role: "ADMIN" });

      expect(adminUsersService.updateRole).toHaveBeenCalledWith("admin-1", "ADMIN");
    });

    it("404s when the target user doesn't exist", async () => {
      adminUsersService.getUserById.mockResolvedValue(null);

      await expect(controller.updateRole(makeRequest("admin-1"), "user-2", { role: "ADMIN" })).rejects.toThrow(
        ApiException
      );
      expect(adminUsersService.updateRole).not.toHaveBeenCalled();
    });

    it("promotes a different user to ADMIN", async () => {
      adminUsersService.getUserById.mockResolvedValue(OTHER_USER);
      adminUsersService.updateRole.mockResolvedValue({ ...OTHER_USER, role: "ADMIN" });

      const result = await controller.updateRole(makeRequest("admin-1"), "user-2", { role: "ADMIN" });

      expect(adminUsersService.updateRole).toHaveBeenCalledWith("user-2", "ADMIN");
      expect(result.role).toBe("ADMIN");
    });
  });
});
