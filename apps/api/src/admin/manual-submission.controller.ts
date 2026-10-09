import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { Roles } from "../common/roles.decorator.js";
import { RolesGuard } from "../common/roles.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { ManualSubmissionService } from "./manual-submission.service.js";

// A human submission is scoped to ANALYST and ADMIN — the same pair
// custom-statistics.controller.ts uses for the platform's other
// human-authored, review-gated input, rather than every signed-in USER.
@ApiTags("admin")
@Controller("v1/admin/games/:gameId")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.ANALYST, Role.ADMIN)
export class ManualSubmissionController {
  constructor(private readonly manualSubmissionService: ManualSubmissionService) {}

  @Post("submit-events")
  @ApiOperation({
    summary: "Submit a full game's play-by-play by hand, as a new PENDING_REVIEW batch (analyst or admin)",
  })
  @ApiParam({ name: "gameId", description: "Game UUID — must have no existing events" })
  @ApiBody({
    description:
      "{ events: SubmittedEvent[], minutesByPlayerId: Record<playerId, minutes> } — every player appearing in events needs a minutesByPlayerId entry",
  })
  @ApiResponse({ status: 201, description: "Batch created, pending admin review" })
  @ApiResponse({ status: 400, description: "The submission failed schema validation" })
  @ApiResponse({ status: 404, description: "Game not found" })
  @ApiResponse({ status: 409, description: "The game already has events — use a correction instead" })
  submitEvents(
    @Param("gameId") gameId: string,
    @Body() body: unknown,
    @Req() request: { user: { id: string } },
  ) {
    return this.manualSubmissionService.submitGameEvents(gameId, request.user.id, body);
  }
}
