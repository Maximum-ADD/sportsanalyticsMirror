import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { Roles } from "../common/roles.decorator.js";
import { RolesGuard } from "../common/roles.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AdminAnomaliesService } from "./admin-anomalies.service.js";

@ApiTags("admin")
@Controller("v1/admin")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminAnomaliesController {
  constructor(private readonly adminAnomaliesService: AdminAnomaliesService) {}

  @Get("games/:gameId/anomalies")
  @ApiOperation({
    summary: "List PlayerGameStat rows for a game that fail basic sanity checks (admin only)",
  })
  @ApiParam({ name: "gameId", description: "Game UUID" })
  @ApiResponse({ status: 200, description: "Flagged rows, empty when nothing looks wrong" })
  listAnomalies(@Param("gameId") gameId: string) {
    return this.adminAnomaliesService.listAnomaliesForGame(gameId);
  }
}
