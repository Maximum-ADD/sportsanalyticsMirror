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
import { AdminEventsService, type CorrectionWithDetails } from "./admin-events.service.js";
import { parseCorrectEventBody, type CorrectionRequest } from "./event-correction-request.js";

function badRequest(message: string): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", message);
}

/**
 * The event sequence from the route.
 * @throws ApiException 400 unless it's a non-negative integer.
 */
function parseSequence(sequenceParam: string): number {
  const sequence = Number(sequenceParam);
  if (!Number.isInteger(sequence) || sequence < 0) throw badRequest("sequence must be a non-negative integer");
  return sequence;
}

/**
 * The parsed correction body.
 * @throws ApiException 400 naming the malformed field or missing reason.
 */
function parseCorrectionRequest(body: unknown): CorrectionRequest {
  try {
    return parseCorrectEventBody(body);
  } catch (err) {
    throw badRequest((err as Error).message);
  }
}

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
  @ApiResponse({ status: 201, description: "Correction recorded, with the stats it changed" })
  @ApiResponse({ status: 400, description: "Invalid correction body, missing reason, or a play that breaks a rule" })
  @ApiResponse({ status: 404, description: "Game or event not found" })
  correctEvent(
    @Param("gameId") gameId: string,
    @Param("sequence") sequenceParam: string,
    @Body() body: unknown,
    @Req() request: { user: { id: string } },
  ) {
    const sequence = parseSequence(sequenceParam);
    return this.adminEventsService.correctEvent(gameId, sequence, parseCorrectionRequest(body), request.user.id);
  }

  @Post("games/:gameId/replay")
  @ApiOperation({
    summary: "Re-derive a game's stats from its current events without correcting anything (admin only)",
  })
  @ApiParam({ name: "gameId", description: "Game UUID" })
  @ApiResponse({ status: 201, description: "Replay result: how many players' stats were recomputed and changed" })
  @ApiResponse({ status: 404, description: "Game not found" })
  replayGame(@Param("gameId") gameId: string) {
    return this.adminEventsService.replayGame(gameId);
  }
}
