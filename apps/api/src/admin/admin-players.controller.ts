import { Body, Controller, Get, HttpStatus, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { ApiException } from "../common/api-exception.js";
import { Roles } from "../common/roles.decorator.js";
import { RolesGuard } from "../common/roles.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AdminPlayersService, type PlayerWithTeam, type UpdatePlayerDto } from "./admin-players.service.js";

const REQUIRED_STRING_FIELDS = ["firstName", "lastName", "position"] as const;
const NULLABLE_STRING_FIELDS = ["jerseyNumber", "headshotUrl", "school", "country", "lastAffiliation", "rosterStatus"] as const;
const NULLABLE_INT_FIELDS = ["heightInches", "weightLbs", "seasonExp", "draftYear", "draftRound", "draftNumber"] as const;

// Shape-checks the PATCH body before it reaches Prisma, the same contract
// parseSaveLineupBody uses for /v1/me/lineups: every field is optional, but
// one that IS present must be well-formed. teamId is deliberately NOT
// checked against a real Team row here, matching MeController's own
// favoriteTeamId — an invalid id fails the FK constraint below instead (see
// isForeignKeyConstraintError), which is this app's existing precedent for
// that tradeoff.
export function parseUpdatePlayerBody(body: unknown): UpdatePlayerDto {
  if (typeof body !== "object" || body === null) {
    throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "Request body must be an object");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdatePlayerDto = {};

  for (const field of REQUIRED_STRING_FIELDS) {
    if (raw[field] === undefined) continue;
    if (typeof raw[field] !== "string" || (raw[field] as string).trim().length === 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", `${field} must be a non-empty string`);
    }
    patch[field] = (raw[field] as string).trim();
  }

  for (const field of NULLABLE_STRING_FIELDS) {
    if (raw[field] === undefined) continue;
    if (raw[field] !== null && typeof raw[field] !== "string") {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", `${field} must be a string or null`);
    }
    patch[field] = raw[field] as string | null;
  }

  for (const field of NULLABLE_INT_FIELDS) {
    if (raw[field] === undefined) continue;
    if (raw[field] !== null && (typeof raw[field] !== "number" || !Number.isInteger(raw[field]))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", `${field} must be a whole number or null`);
    }
    patch[field] = raw[field] as number | null;
  }

  if (raw.teamId !== undefined) {
    if (raw.teamId !== null && typeof raw.teamId !== "string") {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "teamId must be a string or null");
    }
    patch.teamId = raw.teamId;
  }

  if (raw.birthDate !== undefined) {
    if (raw.birthDate === null) {
      patch.birthDate = null;
    } else {
      if (typeof raw.birthDate !== "string") {
        throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "birthDate must be an ISO date string or null");
      }
      const parsed = new Date(raw.birthDate);
      if (Number.isNaN(parsed.getTime())) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "birthDate must be a valid date");
      }
      patch.birthDate = parsed;
    }
  }

  return patch;
}

// Prisma's foreign-key-violation code — thrown here when teamId doesn't
// match a real Team row. Narrow-checked structurally rather than importing
// the Prisma error class, matching isUniqueConstraintError in me.controller.ts.
function isForeignKeyConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
}

@ApiTags("admin")
@Controller("v1/admin/players")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminPlayersController {
  constructor(private readonly adminPlayersService: AdminPlayersService) {}

  @Get()
  @ApiOperation({ summary: "List players (paginated, admin only)" })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "teamId", required: false })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Paginated player list" })
  listPlayers(@Query() query: Record<string, unknown>) {
    return this.adminPlayersService.listPlayers(query);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edit a player's imported fields (admin only)" })
  @ApiParam({ name: "id", description: "Player UUID" })
  @ApiResponse({ status: 200, description: "Updated player" })
  @ApiResponse({ status: 400, description: "Invalid field value" })
  @ApiResponse({ status: 404, description: "Player not found" })
  async updatePlayer(@Param("id") id: string, @Body() body: unknown): Promise<PlayerWithTeam> {
    const patch = parseUpdatePlayerBody(body);
    const player = await this.adminPlayersService.getPlayerById(id);
    if (!player) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Player not found");
    }

    try {
      return await this.adminPlayersService.updatePlayer(id, patch);
    } catch (error) {
      if (isForeignKeyConstraintError(error)) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "teamId does not match a real team");
      }
      throw error;
    }
  }
}
