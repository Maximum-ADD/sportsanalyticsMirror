import { Body, Controller, Get, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ApiException } from "../common/api-exception.js";
import { Roles } from "../common/roles.decorator.js";
import { RolesGuard } from "../common/roles.guard.js";
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

  @Post()
  async createDefinition(@Req() request: { user: { id: string } }, @Body() body: unknown) {
    const input = body as { name?: unknown; expression?: unknown };
    if (typeof input.name !== "string" || !input.name.trim() || typeof input.expression !== "string" || !input.expression.trim()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "name and expression are required");
    }
    return this.customStatisticsService.createDefinition(request.user.id, input.name.trim(), input.expression.trim());
  }
}
