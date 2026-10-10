import { Body, Controller, Delete, Get, HttpStatus, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import type { Request } from "express";
import { ApiException } from "../common/api-exception.js";
import { Roles } from "../common/roles.decorator.js";
import { RolesGuard } from "../common/roles.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { requestUserId } from "../me/me.controller.js";
import { AdminUsersService, type AdminUserSummary } from "./admin-users.service.js";

const ROLE_VALUES = new Set<string>(Object.values(Role));

export function parseRoleBody(body: unknown): Role {
  if (typeof body !== "object" || body === null || !("role" in body)) {
    throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "Request body must be { role }");
  }
  const { role } = body as Record<string, unknown>;
  if (typeof role !== "string" || !ROLE_VALUES.has(role)) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      "BAD_REQUEST",
      `role must be one of: ${Object.values(Role).join(", ")}`
    );
  }
  return role as Role;
}

// Every route here is ADMIN-only (see AdminModule) and acts on a :userId
// other than the caller's own — unlike MeController/SavedLineupsController,
// which deliberately have no :userId param at all because they only ever
// act on the caller. The self-protection checks below (can't delete or
// demote your own account through this controller) exist for the same
// reason: nothing here should be able to lock every admin out at once.
@ApiTags("admin")
@Controller("v1/admin/users")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: "List users (paginated, admin only)" })
  @ApiQuery({ name: "search", required: false, description: "Search by email, name, or username" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Paginated user list" })
  listUsers(@Query() query: Record<string, unknown>) {
    return this.adminUsersService.listUsers(query);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a user account (admin only)" })
  @ApiParam({ name: "id", description: "User UUID" })
  @ApiResponse({ status: 200, description: "User deleted" })
  @ApiResponse({ status: 400, description: "Cannot delete your own account through this endpoint" })
  @ApiResponse({ status: 404, description: "User not found" })
  async deleteUser(@Req() request: Request, @Param("id") id: string): Promise<{ deleted: true }> {
    if (id === requestUserId(request)) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "CANNOT_DELETE_SELF",
        "You can't delete your own account from here — use the delete account control on your profile instead"
      );
    }
    const user = await this.adminUsersService.getUserById(id);
    if (!user) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "User not found");
    }
    await this.adminUsersService.deleteUser(id);
    return { deleted: true };
  }

  // PATCH rather than POST/DELETE "make-admin"/"remove-admin" endpoints:
  // role is a single field being set to one of a closed set of values, the
  // same shape as MeController's PATCH /v1/me, just admin-scoped and with
  // the full Role enum open to it (not only ADMIN) so this one route also
  // covers demoting an ADMIN back to USER.
  @Patch(":id/role")
  @ApiOperation({ summary: "Change a user's role (admin only)" })
  @ApiParam({ name: "id", description: "User UUID" })
  @ApiResponse({ status: 200, description: "Updated user" })
  @ApiResponse({ status: 400, description: "Invalid role, or attempting to demote your own account" })
  @ApiResponse({ status: 404, description: "User not found" })
  async updateRole(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ): Promise<AdminUserSummary> {
    const role = parseRoleBody(body);

    if (id === requestUserId(request) && role !== Role.ADMIN) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "CANNOT_DEMOTE_SELF",
        "You can't remove your own admin access — have another admin do it"
      );
    }

    const user = await this.adminUsersService.getUserById(id);
    if (!user) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "User not found");
    }
    return this.adminUsersService.updateRole(id, role);
  }
}
