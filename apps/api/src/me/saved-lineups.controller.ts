import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ApiException } from "../common/api-exception.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { requestUserId } from "./me.controller.js";
import { SavedLineupsService, type SaveLineupInput, type SavedLineupSummary } from "./saved-lineups.service.js";

function badRequest(message: string): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", message);
}

// Long enough for "Week 3 flyers vs the league leader", short enough that a
// profile card title never wraps to three lines.
const MAX_LINEUP_NAME_LENGTH = 50;

/**
 * Shape-checks the POST /v1/me/lineups body before it reaches the service,
 * which only speaks in business rules (the solver constraints from
 * optimize.py). A structurally malformed body is a plain 400 here; the
 * solver-mirroring INVALID_LINEUP checks only run on a well-formed board.
 *
 * @param body - the raw request body.
 * @returns the parsed save input, slots in request order, name trimmed. A
 *          missing or blank name is a 400 — every lineup gets a name so a
 *          profile full of saves stays findable.
 * @throws ApiException 400 BAD_REQUEST on any malformed field.
 */
export function parseSaveLineupBody(body: unknown): SaveLineupInput {
  if (typeof body !== "object" || body === null) {
    throw badRequest("Request body must be { budget, name, slots }");
  }
  const { budget, name, slots } = body as Record<string, unknown>;

  if (typeof budget !== "number" || !Number.isInteger(budget) || budget <= 0) {
    throw badRequest("budget must be a positive whole number of dollars");
  }
  if (typeof name !== "string") {
    throw badRequest("name must be a string — every saved lineup gets one");
  }
  // Trim up front: a name of invisible spaces would render as a mysteriously
  // empty profile title, and the length cap applies to what actually stores.
  const parsedName = name.trim();
  if (parsedName.length === 0) {
    throw badRequest("name can't be blank — every saved lineup gets one");
  }
  if (parsedName.length > MAX_LINEUP_NAME_LENGTH) {
    throw badRequest(`name must be at most ${MAX_LINEUP_NAME_LENGTH} characters`);
  }
  if (!Array.isArray(slots)) {
    throw badRequest("slots must be an array");
  }

  const parsedSlots = slots.map((slot): SaveLineupInput["slots"][number] => {
    if (typeof slot !== "object" || slot === null) {
      throw badRequest("each slot must be { playerId, predictedPointsAtSave, salaryAtSave }");
    }
    const { playerId, predictedPointsAtSave, salaryAtSave } = slot as Record<string, unknown>;
    if (typeof playerId !== "string" || playerId.length === 0) {
      throw badRequest("each slot's playerId must be a non-empty string");
    }
    if (typeof predictedPointsAtSave !== "number" || !Number.isFinite(predictedPointsAtSave) || predictedPointsAtSave < 0) {
      throw badRequest("each slot's predictedPointsAtSave must be a non-negative finite number");
    }
    if (typeof salaryAtSave !== "number" || !Number.isInteger(salaryAtSave) || salaryAtSave < 0) {
      throw badRequest("each slot's salaryAtSave must be a non-negative whole number of dollars");
    }
    return { playerId, predictedPointsAtSave, salaryAtSave };
  });

  return { budget, name: parsedName, slots: parsedSlots };
}

// Saved lineups live under /v1/me like everything else user-scoped: every
// route acts on the signed-in user only (see MeController's note on the
// no-:userId-param rule) and the guard is applied here rather than globally
// so the swagger tag reads "me" the same way.
@ApiTags("me")
@Controller("v1/me")
@UseGuards(SessionAuthGuard)
export class SavedLineupsController {
  constructor(private readonly savedLineupsService: SavedLineupsService) {}

  @Get("lineups")
  @ApiOperation({ summary: "List the current user's saved lineups, newest first" })
  @ApiResponse({ status: 200, description: "Saved lineups with frozen values and drift" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  listSavedLineups(@Req() request: Request): Promise<SavedLineupSummary[]> {
    return this.savedLineupsService.listSavedLineups(requestUserId(request));
  }

  // POST defaults to 201 in Nest; set explicitly so the contract doesn't
  // ride on the framework default should this route ever change verbs.
  @Post("lineups")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Save a lineup from the optimizer board" })
  @ApiResponse({ status: 201, description: "The saved lineup, values frozen per slot" })
  @ApiResponse({ status: 400, description: "Malformed body, or the board breaks a solver constraint" })
  async saveLineup(@Req() request: Request, @Body() body: unknown): Promise<SavedLineupSummary> {
    return this.savedLineupsService.saveLineup(requestUserId(request), parseSaveLineupBody(body));
  }

  @Delete("lineups/:lineupId")
  @ApiOperation({ summary: "Delete one of the current user's saved lineups (idempotent)" })
  @ApiResponse({ status: 200, description: "Lineup is gone (or never existed for this user)" })
  async deleteSavedLineup(
    @Req() request: Request,
    @Param("lineupId") lineupId: string
  ): Promise<{ deleted: true }> {
    await this.savedLineupsService.deleteSavedLineup(requestUserId(request), lineupId);
    return { deleted: true };
  }
}
