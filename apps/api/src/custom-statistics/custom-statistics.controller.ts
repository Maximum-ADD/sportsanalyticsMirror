import { Body, Controller, Get, HttpStatus, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SeasonType } from "@prisma/client";
import { ApiException } from "../common/api-exception.js";
import { Roles } from "../common/roles.decorator.js";
import { RolesGuard } from "../common/roles.guard.js";
import { parseSeasonType } from "../common/season-type.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { CustomStatisticsService } from "./custom-statistics.service.js";

@ApiTags("custom-statistics")
@Controller("v1/custom-statistics")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles("ANALYST", "ADMIN")
export class CustomStatisticsController {
  constructor(private readonly customStatisticsService: CustomStatisticsService) {}

  @Get()
  @ApiOperation({ summary: "List your custom statistics, most recently edited first (analyst or admin)" })
  listDefinitions(@Req() request: { user: { id: string } }) {
    return this.customStatisticsService.listDefinitions(request.user.id);
  }

  @Get(":id/value")
  @ApiOperation({ summary: "Evaluate a custom statistic for one player, at its current or an earlier version" })
  @ApiParam({ name: "id", description: "Custom statistic UUID" })
  @ApiQuery({ name: "playerId", required: true, description: "Player UUID to calculate" })
  @ApiQuery({ name: "seasonType", required: false, enum: Object.values(SeasonType), description: "Season segment. Omit for every segment." })
  @ApiQuery({
    name: "version",
    required: false,
    type: Number,
    description: "Evaluate this version's expression (see /versions); omit for the current one",
  })
  @ApiResponse({ status: 200, description: "The value, with the version and expression that produced it" })
  @ApiResponse({ status: 400, description: "Missing playerId, or an invalid seasonType or version" })
  @ApiResponse({ status: 404, description: "No such statistic or version, or it isn't yours" })
  async calculateDefinition(
    @Req() request: { user: { id: string } },
    @Param("id") definitionId: string,
    @Query("playerId") playerId: unknown,
    @Query("seasonType") rawSeasonType: unknown,
    @Query("version") rawVersion?: unknown
  ) {
    if (typeof playerId !== "string" || !playerId.trim()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "playerId is required");
    }

    const value = await this.customStatisticsService.calculateDefinition(
      request.user.id,
      definitionId,
      playerId,
      parseSeasonType(rawSeasonType),
      parseVersion(rawVersion)
    );
    if (!value) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Custom statistic or version not found");
    return value;
  }

  @Get(":id/versions")
  @ApiOperation({ summary: "Every expression a custom statistic has had, oldest first" })
  @ApiParam({ name: "id", description: "Custom statistic UUID" })
  @ApiResponse({ status: 200, description: "Version history" })
  @ApiResponse({ status: 404, description: "No such statistic, or it isn't yours" })
  async listVersions(@Req() request: { user: { id: string } }, @Param("id") definitionId: string) {
    const versions = await this.customStatisticsService.listVersions(request.user.id, definitionId);
    if (!versions) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Custom statistic not found");
    return { definitionId, versions };
  }

  @Post()
  @ApiOperation({ summary: "Define a statistic as a formula over event-derived per-game averages (analyst or admin)" })
  @ApiResponse({ status: 400, description: "Missing name or expression, or the expression fails validation" })
  async createDefinition(@Req() request: { user: { id: string } }, @Body() body: unknown) {
    const input = body as { name?: unknown; expression?: unknown };
    if (typeof input.name !== "string" || !input.name.trim() || typeof input.expression !== "string" || !input.expression.trim()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "name and expression are required");
    }

    try {
      return await this.customStatisticsService.createDefinition(request.user.id, input.name.trim(), input.expression.trim());
    } catch (error) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", (error as Error).message);
    }
  }

  @Put(":id")
  @ApiOperation({ summary: "Replace a statistic's expression as a new version; earlier versions stay evaluable" })
  @ApiParam({ name: "id", description: "Custom statistic UUID" })
  @ApiResponse({ status: 400, description: "Missing expression, or it fails validation" })
  async updateDefinition(
    @Req() request: { user: { id: string } },
    @Param("id") definitionId: string,
    @Body() body: { expression?: unknown }
  ) {
    if (typeof body.expression !== "string" || !body.expression.trim()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "expression is required");
    }

    try {
      return await this.customStatisticsService.updateDefinition(request.user.id, definitionId, body.expression.trim());
    } catch (error) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", (error as Error).message);
    }
  }
}

/**
 * Reads the optional ?version= query value.
 *
 * @returns undefined when absent (meaning "the current version"), or the
 *   version number.
 * @throws ApiException 400 for anything but a positive whole number.
 */
function parseVersion(rawVersion: unknown): number | undefined {
  if (rawVersion === undefined || rawVersion === "") return undefined;
  const version = Number(rawVersion);
  if (!Number.isInteger(version) || version < 1) {
    throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "version must be a positive whole number");
  }
  return version;
}
