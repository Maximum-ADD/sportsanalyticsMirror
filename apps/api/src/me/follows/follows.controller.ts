import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { parseBody } from "../../common/parse-body.js";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import type { AuthenticatedRequest } from "./authenticated-request.js";
import { FollowsWriteService } from "./follows-write.service.js";

// A scouting note is a line or two on a watchlist card, not an essay; the cap
// keeps one user's note from bloating every watchlist response.
const MAX_NOTE_LENGTH = 500;

// PATCH takes the note and nothing else - following and unfollowing are their
// own routes. Explicitly nullable so a user can clear a note they no longer
// want, which an optional field could not express (absent would be
// indistinguishable from "leave it alone").
const updatePlayerNoteSchema = z.object({
  note: z.string().max(MAX_NOTE_LENGTH).nullable(),
});

// PUT replaces the follow's whole representation, so an omitted isPrimary
// means false, not "unchanged" - which is what makes repeating the same PUT
// land on the same state.
const putTeamFollowSchema = z.object({
  isPrimary: z.boolean().default(false),
});

// Express 5 leaves req.body undefined when a request carries no JSON body at
// all, which is normal for these routes (a follow needs no payload). Passing
// {} in its place lets the schema decide what is required, so a bodyless PUT
// gets the default rather than a confusing "expected object, received
// undefined".
function toValidatableBody(body: unknown): unknown {
  return body ?? {};
}

/**
 * Writes to the signed-in user's follow graph - the players on their watchlist
 * and the teams whose results they track. Every route is scoped to
 * request.user.id, so there is no path by which one user reaches another's
 * follows.
 *
 * These are the first write routes in this API. They keep the conventions the
 * read routes established: the v1 prefix, ApiException for every error, and no
 * response shape that a GET does not also use.
 */
@Controller("v1/me/follows")
@UseGuards(SessionAuthGuard)
export class FollowsController {
  constructor(private readonly followsWriteService: FollowsWriteService) {}

  // POST /v1/me/follows/players/:playerId - start following a player.
  // Idempotent: following someone twice leaves one follow, unchanged.
  @Post("players/:playerId")
  followPlayer(@Req() request: AuthenticatedRequest, @Param("playerId") playerId: string) {
    return this.followsWriteService.createPlayerFollow(request.user.id, playerId);
  }

  // PATCH /v1/me/follows/players/:playerId - replace the scouting note on a
  // player already followed. 404s rather than creating the follow.
  @Patch("players/:playerId")
  updatePlayerNote(
    @Req() request: AuthenticatedRequest,
    @Param("playerId") playerId: string,
    @Body() body: unknown
  ) {
    const payload = parseBody(updatePlayerNoteSchema, toValidatableBody(body));
    return this.followsWriteService.updatePlayerFollowNote(request.user.id, playerId, payload.note);
  }

  // DELETE /v1/me/follows/players/:playerId - stop following a player.
  // Returns 200 with { playerId, removed } rather than a bare 204: removed
  // tells the caller whether there was anything there, and unfollowing someone
  // you never followed is not an error.
  @Delete("players/:playerId")
  @HttpCode(HttpStatus.OK)
  async unfollowPlayer(@Req() request: AuthenticatedRequest, @Param("playerId") playerId: string) {
    const result = await this.followsWriteService.deletePlayerFollow(request.user.id, playerId);
    return { playerId, ...result };
  }

  // PUT /v1/me/follows/teams/:teamId - follow a team, optionally as the user's
  // one primary team. Idempotent; promoting a new primary demotes the old one.
  @Put("teams/:teamId")
  updateTeamFollow(
    @Req() request: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Body() body: unknown
  ) {
    const payload = parseBody(putTeamFollowSchema, toValidatableBody(body));
    return this.followsWriteService.putTeamFollow(request.user.id, teamId, payload.isPrimary);
  }

  // DELETE /v1/me/follows/teams/:teamId - stop following a team.
  @Delete("teams/:teamId")
  @HttpCode(HttpStatus.OK)
  async unfollowTeam(@Req() request: AuthenticatedRequest, @Param("teamId") teamId: string) {
    const result = await this.followsWriteService.deleteTeamFollow(request.user.id, teamId);
    return { teamId, ...result };
  }
}
