import { Body, Controller, Get, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
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
  listDefinitions(@Req() request: { user: { id: string } }) {
    return this.customStatisticsService.listDefinitions(request.user.id);
  }

  @Get(":id/value")
  @ApiParam({ name: "id", description: "Custom statistic UUID" })
  @ApiQuery({ name: "playerId", required: true, description: "Player UUID to calculate" })
  @ApiQuery({ name: "seasonType", required: false, description: "Optional season segment" })
  async calculateDefinition(
    @Req() request: { user: { id: string } },
    @Param("id") definitionId: string,
    @Query("playerId") playerId: unknown,
    @Query("seasonType") rawSeasonType: unknown
  ) {
    if (typeof playerId !== "string" || !playerId.trim()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "playerId is required");
    }
    const value = await this.customStatisticsService.calculateDefinition(
      request.user.id,
      definitionId,
      playerId,
      parseSeasonType(rawSeasonType)
    );
    if (!value) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Custom statistic not found");
    return value;
  }

  @Post()
  async createDefinition(@Req() request: { user: { id: string } }, @Body() body: unknown) {
    const input = body as { name?: unknown; expression?: unknown };
    if (typeof input.name !== "string" || !input.name.trim() || typeof input.expression !== "string" || !input.expression.trim()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "name and expression are required");
    }
    return this.customStatisticsService.createDefinition(request.user.id, input.name.trim(), input.expression.trim());
  }
}
