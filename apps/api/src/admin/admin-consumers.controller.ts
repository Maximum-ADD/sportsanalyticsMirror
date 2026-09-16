import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { ApiException } from "../common/api-exception.js";
import { Roles } from "../common/roles.decorator.js";
import { RolesGuard } from "../common/roles.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import {
  AdminConsumersService,
  type CreatedApiKey,
} from "./admin-consumers.service.js";

@ApiTags("admin")
@Controller("v1/admin/consumers")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminConsumersController {
  constructor(private readonly adminConsumersService: AdminConsumersService) {}

  // GET /v1/admin/consumers — list all consumers with usage stats.
  @Get()
  @ApiOperation({ summary: "List API consumers with usage stats (admin only)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Paginated consumer list" })
  listConsumers(@Query() query: Record<string, unknown>) {
    return this.adminConsumersService.listConsumers(query);
  }

  // POST /v1/admin/consumers — create a new consumer.
  @Post()
  @ApiOperation({ summary: "Create a new API consumer (admin only)" })
  @ApiResponse({ status: 201, description: "Consumer created" })
  @ApiResponse({ status: 400, description: "Invalid request body" })
  async createConsumer(@Body() body: unknown) {
    try {
      return await this.adminConsumersService.createConsumer(body);
    } catch (err) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", (err as Error).message);
    }
  }

  // PATCH /v1/admin/consumers/:id — update consumer settings.
  @Patch(":id")
  @ApiOperation({ summary: "Update an API consumer's settings (admin only)" })
  @ApiParam({ name: "id", description: "Consumer UUID" })
  @ApiResponse({ status: 200, description: "Consumer updated" })
  @ApiResponse({ status: 404, description: "Consumer not found" })
  async updateConsumer(@Param("id") id: string, @Body() body: unknown) {
    const consumer = await this.adminConsumersService.updateConsumer(id, body);
    if (!consumer) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Consumer not found");
    }
    return consumer;
  }

  // POST /v1/admin/consumers/:id/keys — generate a new API key.
  @Post(":id/keys")
  @ApiOperation({ summary: "Generate a new API key for a consumer (admin only)" })
  @ApiParam({ name: "id", description: "Consumer UUID" })
  @ApiResponse({ status: 201, description: "API key generated (raw key shown once)" })
  @ApiResponse({ status: 404, description: "Consumer not found" })
  async createApiKey(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CreatedApiKey> {
    const label = typeof body === "object" && body !== null && typeof (body as Record<string, unknown>).label === "string"
      ? ((body as Record<string, unknown>).label as string)
      : undefined;

    const key = await this.adminConsumersService.createApiKey(id, label);
    if (!key) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Consumer not found");
    }
    return key;
  }

  // DELETE /v1/admin/consumers/:id — delete a consumer and its keys.
  @Delete(":id")
  @ApiOperation({ summary: "Delete an API consumer and its keys (admin only)" })
  @ApiParam({ name: "id", description: "Consumer UUID" })
  @ApiResponse({ status: 200, description: "Consumer deleted" })
  @ApiResponse({ status: 404, description: "Consumer not found" })
  async deleteConsumer(@Param("id") id: string): Promise<{ deleted: true }> {
    const deleted = await this.adminConsumersService.deleteConsumer(id);
    if (!deleted) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Consumer not found");
    }
    return { deleted: true };
  }

  // DELETE /v1/admin/consumers/:id/keys/:keyId — revoke a key.
  @Delete(":id/keys/:keyId")
  @ApiOperation({ summary: "Revoke an API key (admin only)" })
  @ApiParam({ name: "id", description: "Consumer UUID" })
  @ApiParam({ name: "keyId", description: "API key UUID" })
  @ApiResponse({ status: 200, description: "Key revoked" })
  @ApiResponse({ status: 404, description: "Consumer or key not found" })
  async revokeApiKey(
    @Param("id") consumerId: string,
    @Param("keyId") keyId: string,
  ) {
    const revoked = await this.adminConsumersService.revokeApiKey(consumerId, keyId);
    if (!revoked) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Consumer or key not found");
    }
    return { revoked: true };
  }

  // DELETE /v1/admin/consumers/:id/keys/:keyId/purge — permanently delete a key.
  @Delete(":id/keys/:keyId/purge")
  @ApiOperation({ summary: "Permanently delete an API key (admin only)" })
  @ApiParam({ name: "id", description: "Consumer UUID" })
  @ApiParam({ name: "keyId", description: "API key UUID" })
  @ApiResponse({ status: 200, description: "Key deleted" })
  @ApiResponse({ status: 404, description: "Consumer or key not found" })
  async deleteApiKey(
    @Param("id") consumerId: string,
    @Param("keyId") keyId: string,
  ) {
    const deleted = await this.adminConsumersService.deleteApiKey(consumerId, keyId);
    if (!deleted) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Consumer or key not found");
    }
    return { deleted: true };
  }
}
