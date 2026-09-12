import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { parseBody } from "../../common/parse-body.js";
import { parsePageParams } from "../../common/pagination.js";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import { SavedLineupsService } from "./saved-lineups.service.js";

// Matches the comparison shelf's label bound so both cards behave the same.
const MAX_NAME_LENGTH = 120;

const createSavedLineupSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  // Validated as a non-empty string rather than a uuid so that an id which is
  // merely unknown gets the 404 it deserves instead of a shape-based 400.
  sourceLineupId: z.string().min(1),
});

// The user's saved lineup shelf. Every route is scoped to the session's own
// user id — the id in the URL is never sufficient on its own.
@Controller("v1/me/saved/lineups")
@UseGuards(SessionAuthGuard)
export class SavedLineupsController {
  constructor(private readonly savedLineupsService: SavedLineupsService) {}

  // GET /v1/me/saved/lineups?page=&pageSize= — the signed-in user's saved lineups with slots and drift.
  @Get()
  listSavedLineups(@Req() request: { user: { id: string } }, @Query() query: Record<string, unknown>) {
    return this.savedLineupsService.getSavedLineups(request.user.id, parsePageParams(query));
  }

  // POST /v1/me/saved/lineups — snapshots an existing optimizer lineup onto the signed-in user's shelf.
  @Post()
  createSavedLineup(@Req() request: { user: { id: string } }, @Body() body: unknown) {
    const payload = parseBody(createSavedLineupSchema, body);
    return this.savedLineupsService.createSavedLineup(request.user.id, payload.name, payload.sourceLineupId);
  }

  // DELETE /v1/me/saved/lineups/:id — removes one of the signed-in user's saved lineups.
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSavedLineup(@Req() request: { user: { id: string } }, @Param("id") id: string): Promise<void> {
    return this.savedLineupsService.deleteSavedLineup(request.user.id, id);
  }
}
