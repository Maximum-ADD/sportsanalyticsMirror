import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { ApiException } from "../common/api-exception.js";
import { Roles } from "../common/roles.decorator.js";
import { RolesGuard } from "../common/roles.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import {
  AdminEventsService,
  parseCorrectEventBody,
  type CorrectionWithDetails,
} from "./admin-events.service.js";

@ApiTags("admin")
@Controller("v1/admin")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminEventsController {
  constructor(private readonly adminEventsService: AdminEventsService) {}

  @Get("events/corrections")
  @ApiOperation({ summary: "List all event corrections (paginated, admin only)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Paginated correction list" })
  listCorrections(@Query() query: Record<string, unknown>) {
    return this.adminEventsService.listCorrections(query);
  }

  @Get("games/:gameId/corrections")
  @ApiOperation({ summary: "List corrections for a specific game (admin only)" })
  @ApiParam({ name: "gameId", description: "Game UUID" })
  @ApiResponse({ status: 200, description: "Corrections for the game" })
  listGameCorrections(@Param("gameId") gameId: string): Promise<CorrectionWithDetails[]> {
    return this.adminEventsService.listCorrectionsForGame(gameId);
  }

  @Post("games/:gameId/events/:sequence/correct")
  @ApiOperation({ summary: "Correct a game event and record the audit trail (admin only)" })
  @ApiParam({ name: "gameId", description: "Game UUID" })
  @ApiParam({ name: "sequence", description: "Event sequence number" })
  @ApiResponse({ status: 201, description: "Correction recorded" })
  @ApiResponse({ status: 400, description: "Invalid correction body" })
  @ApiResponse({ status: 404, description: "Event not found" })
  async correctEvent(
    @Param("gameId") gameId: string,
    @Param("sequence") sequenceStr: string,
    @Body() body: unknown,
    @Req() request: { user: { id: string } },
  ) {
    const sequence = Number(sequenceStr);
    if (!Number.isInteger(sequence) || sequence < 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "sequence must be a non-negative integer");
    }

    let patch;
    try {
      patch = parseCorrectEventBody(body);
    } catch (err) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", (err as Error).message);
    }

    const correction = await this.adminEventsService.correctEvent(
      gameId,
      sequence,
      patch,
      request.user.id,
    );

    if (!correction) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Event not found");
    }

    return correction;
  }
}
