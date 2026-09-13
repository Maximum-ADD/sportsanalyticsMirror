import { Body, Controller, Get, HttpStatus, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Role, type Team } from "@prisma/client";
import { ApiException } from "../common/api-exception.js";
import { Roles } from "../common/roles.decorator.js";
import { RolesGuard } from "../common/roles.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AdminTeamsService, type UpdateTeamDto } from "./admin-teams.service.js";

const EDITABLE_STRING_FIELDS = ["name", "abbreviation", "city", "conference", "division"] as const;

// Shape-checks the PATCH body before it reaches Prisma — every field is
// optional (a request only sends what it's actually changing), but a field
// that IS present must be well-formed, the same contract
// parseSaveLineupBody uses for /v1/me/lineups.
export function parseUpdateTeamBody(body: unknown): UpdateTeamDto {
  if (typeof body !== "object" || body === null) {
    throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "Request body must be an object");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdateTeamDto = {};

  for (const field of EDITABLE_STRING_FIELDS) {
    if (raw[field] === undefined) continue;
    if (typeof raw[field] !== "string" || (raw[field] as string).trim().length === 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", `${field} must be a non-empty string`);
    }
    patch[field] = (raw[field] as string).trim();
  }

  if (raw.logoUrl !== undefined) {
    if (raw.logoUrl !== null && typeof raw.logoUrl !== "string") {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "logoUrl must be a string or null");
    }
    patch.logoUrl = raw.logoUrl;
  }

  return patch;
}

@ApiTags("admin")
@Controller("v1/admin/teams")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminTeamsController {
  constructor(private readonly adminTeamsService: AdminTeamsService) {}

  @Get()
  @ApiOperation({ summary: "List teams (paginated, admin only)" })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Paginated team list" })
  listTeams(@Query() query: Record<string, unknown>) {
    return this.adminTeamsService.listTeams(query);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edit a team's imported fields (admin only)" })
  @ApiParam({ name: "id", description: "Team UUID" })
  @ApiResponse({ status: 200, description: "Updated team" })
  @ApiResponse({ status: 400, description: "Invalid field value" })
  @ApiResponse({ status: 404, description: "Team not found" })
  async updateTeam(@Param("id") id: string, @Body() body: unknown): Promise<Team> {
    const patch = parseUpdateTeamBody(body);
    const team = await this.adminTeamsService.getTeamById(id);
    if (!team) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Team not found");
    }
    return this.adminTeamsService.updateTeam(id, patch);
  }
}
