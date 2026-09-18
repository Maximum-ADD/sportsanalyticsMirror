import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { parseBody } from "../../common/parse-body.js";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import type { CreatedApiKey } from "../../common/api-keys.js";
import type { AuthenticatedRequest } from "../picks/authenticated-request.js";
import { MeApiKeysService, type MyApiKeysView } from "./me-api-keys.service.js";
import { ApiException } from "../../common/api-exception.js";

// POST /v1/me/api-keys accepts nothing but an optional human-readable
// label; unknown keys are stripped by parseBody so the client can't set
// anything else (rate limits stay server-side, on the consumer row).
const createKeySchema = z.object({
  label: z.string().trim().max(80).optional(),
});

// The signed-in user's own API keys, under /v1/me/api-keys — same key
// machinery the admin "API Keys" tab manages, scoped to the caller.
// Every route takes the user from the session (see MeController's
// no-userId-param rule) and every service lookup is scoped through the
// consumer ownership chain, so these endpoints enforce ownership by
// construction rather than by checking an id param against request.user.
@ApiTags("me")
@Controller("v1/me/api-keys")
@UseGuards(SessionAuthGuard)
export class MeApiKeysController {
  constructor(private readonly meApiKeysService: MeApiKeysService) {}

  // GET /v1/me/api-keys — the caller's keys, limits and usage.
  @Get()
  @ApiOperation({ summary: "List the current user's API keys and usage" })
  @ApiResponse({ status: 200, description: "Keys with the personal consumer's limits and usage" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  listMyKeys(@Req() request: AuthenticatedRequest): Promise<MyApiKeysView> {
    return this.meApiKeysService.listMyApiKeys(request.user.id);
  }

  // POST /v1/me/api-keys — mint a key (personal consumer created on first
  // use). The raw key is shown exactly once, like on the admin side.
  @Post()
  @ApiOperation({ summary: "Generate a new API key for the current user" })
  @ApiResponse({ status: 201, description: "API key generated (raw key shown once)" })
  @ApiResponse({ status: 400, description: "Invalid request body" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  // async (not a bare return) so a validation throw surfaces as a
  // rejected promise rather than a synchronous exception — same shape as
  // the admin consumers controller's createConsumer.
  async createKey(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<CreatedApiKey> {
    const { label } = parseBody(createKeySchema, body);
    return this.meApiKeysService.createApiKey(request.user.id, label);
  }

  // DELETE /v1/me/api-keys/:keyId — soft-revoke (key stays, marked
  // inactive), mirroring the admin-side revoke.
  @Delete(":keyId")
  @ApiOperation({ summary: "Revoke one of the current user's API keys" })
  @ApiParam({ name: "keyId", description: "API key UUID" })
  @ApiResponse({ status: 200, description: "Key revoked" })
  @ApiResponse({ status: 404, description: "Key not found" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  async revokeKey(
    @Req() request: AuthenticatedRequest,
    @Param("keyId") keyId: string,
  ): Promise<{ revoked: true }> {
    const revoked = await this.meApiKeysService.revokeApiKey(request.user.id, keyId);
    if (!revoked) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Key not found");
    }
    return { revoked: true };
  }

  // DELETE /v1/me/api-keys/:keyId/purge — hard delete for keys the user
  // doesn't want on their list at all, mirroring the admin-side purge.
  // Distinct path (not a query flag) so the destructive action isn't one
  // accidental boolean away from the reversible one — same choice the
  // admin controller makes.
  @Delete(":keyId/purge")
  @ApiOperation({ summary: "Permanently delete one of the current user's API keys" })
  @ApiParam({ name: "keyId", description: "API key UUID" })
  @ApiResponse({ status: 200, description: "Key deleted" })
  @ApiResponse({ status: 404, description: "Key not found" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  async deleteKey(
    @Req() request: AuthenticatedRequest,
    @Param("keyId") keyId: string,
  ): Promise<{ deleted: true }> {
    const deleted = await this.meApiKeysService.deleteApiKey(request.user.id, keyId);
    if (!deleted) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Key not found");
    }
    return { deleted: true };
  }
}
