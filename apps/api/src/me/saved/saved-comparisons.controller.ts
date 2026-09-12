import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { parseBody } from "../../common/parse-body.js";
import { parsePageParams } from "../../common/pagination.js";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import { SavedComparisonsService } from "./saved-comparisons.service.js";

// The same bounds /v1/players/compare enforces on ?ids= (see
// MIN_COMPARISON_PLAYERS / MAX_COMPARISON_PLAYERS in
// src/players/players.controller.ts): a comparison needs at least two players
// to be a comparison, and the UI lays out at most four tiles side by side.
// Saving a comparison the compare endpoint would then refuse to render would
// be a shelf full of dead cards, so the two must agree.
const MIN_COMPARISON_PLAYERS = 2;
const MAX_COMPARISON_PLAYERS = 4;

// Long enough for a descriptive label ("Wing scorers, Jan trade deadline"),
// short enough that the shelf card never has to truncate to nothing.
const MAX_NAME_LENGTH = 120;

const createSavedComparisonSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
    playerIds: z.array(z.string().min(1)).min(MIN_COMPARISON_PLAYERS).max(MAX_COMPARISON_PLAYERS),
  })
  .refine((body) => new Set(body.playerIds).size === body.playerIds.length, {
    path: ["playerIds"],
    // Comparing a player against themselves is not a comparison, and the
    // SavedComparisonPlayer unique would reject it at the database with a far
    // less useful message.
    message: "playerIds must not contain duplicates",
  });

// The user's saved comparison shelf. Every route is scoped to the session's own
// user id — the id in the URL is never sufficient on its own.
@Controller("v1/me/saved/comparisons")
@UseGuards(SessionAuthGuard)
export class SavedComparisonsController {
  constructor(private readonly savedComparisonsService: SavedComparisonsService) {}

  // GET /v1/me/saved/comparisons?page=&pageSize= — the signed-in user's saved comparisons, newest first, players included.
  @Get()
  listSavedComparisons(@Req() request: { user: { id: string } }, @Query() query: Record<string, unknown>) {
    return this.savedComparisonsService.getSavedComparisons(request.user.id, parsePageParams(query));
  }

  // POST /v1/me/saved/comparisons — saves a 2-4 player comparison for the signed-in user.
  @Post()
  createSavedComparison(@Req() request: { user: { id: string } }, @Body() body: unknown) {
    const payload = parseBody(createSavedComparisonSchema, body);
    return this.savedComparisonsService.createSavedComparison(request.user.id, payload.name, payload.playerIds);
  }

  // DELETE /v1/me/saved/comparisons/:id — removes one of the signed-in user's saved comparisons.
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSavedComparison(@Req() request: { user: { id: string } }, @Param("id") id: string): Promise<void> {
    return this.savedComparisonsService.deleteSavedComparison(request.user.id, id);
  }
}
