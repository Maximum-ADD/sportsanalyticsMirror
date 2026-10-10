import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { parseBody, parseQueryParams } from "../common/parse-body.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import type { AuthenticatedRequest } from "../me/picks/authenticated-request.js";
import { BecomeProService } from "./become-pro.service.js";
import { competitionLevelSchema } from "./competition-level.js";
import { MeBecomeProService } from "./me-become-pro.service.js";

const MAX_TEAM_NAME_LENGTH = 120;
const MAX_OPPONENT_LENGTH = 120;

// "2025-26" — the same league-year format Game.season carries, so a prospect
// season and an NBA season are never labelled differently.
const seasonLabelSchema = z.string().regex(/^\d{4}-\d{2}$/, "must look like 2025-26");

const createSeasonSchema = z.object({
  season: seasonLabelSchema,
  competitionLevel: competitionLevelSchema,
  position: z.string().trim().min(1).max(12),
  teamName: z.string().trim().max(MAX_TEAM_NAME_LENGTH).nullish(),
});

const updateSeasonSchema = createSeasonSchema.partial();

// Bounds here are only what a number can physically be; whether a LINE is
// possible (makes against attempts, threes inside field goals) is decided by
// prospect-box-score.ts, which shares its rules with the admin anomaly checker
// rather than restating them in a schema.
const countSchema = z.number().int().min(0).max(200);

const gameSchema = z.object({
  gameDate: z.coerce.date(),
  opponent: z.string().trim().min(1).max(MAX_OPPONENT_LENGTH),
  minutes: z.number().int().min(0).max(200),
  points: countSchema,
  rebounds: countSchema,
  assists: countSchema,
  steals: countSchema,
  blocks: countSchema,
  turnovers: countSchema,
  fieldGoalsMade: countSchema,
  fieldGoalsAttempted: countSchema,
  threesMade: countSchema,
  threesAttempted: countSchema,
  freeThrowsMade: countSchema,
  freeThrowsAttempted: countSchema,
});

const updateGameSchema = gameSchema.partial();

const profileQuerySchema = z.object({
  seasonId: z.string().min(1).optional(),
});

/**
 * Become Pro, in full: the signed-in user's own seasons, games and valuation.
 *
 * There is no other Become Pro controller. Every route is guarded by
 * SessionAuthGuard and scoped to request.user.id, because Become Pro is private
 * to each user — it compares a user with real NBA players, never with each
 * other, so no user can read another's seasons and nothing needs verifying.
 */
@ApiTags("become-pro")
@Controller("v1/me/become-pro")
@UseGuards(SessionAuthGuard)
export class MeBecomeProController {
  constructor(
    private readonly meBecomeProService: MeBecomeProService,
    private readonly becomeProService: BecomeProService
  ) {}

  // GET /v1/me/become-pro?seasonId= — the whole Become Pro page.
  @Get()
  @ApiOperation({ summary: "Your seasons, with one in full: derived line, games, valuation and NBA comparables" })
  @ApiResponse({ status: 200, description: "Your Become Pro page (empty until you start a season)" })
  @ApiResponse({ status: 404, description: "That season is not yours or does not exist" })
  getMyProfile(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    const { seasonId } = parseQueryParams(profileQuerySchema, query);
    return this.becomeProService.getMyProfile(request.user.id, seasonId);
  }

  // GET /v1/me/become-pro/summary — the small card on Home and Profile.
  @Get("summary")
  @ApiOperation({ summary: "Your current projected value and its trend" })
  @ApiResponse({ status: 200, description: "Your latest season's standing" })
  getMySummary(@Req() request: AuthenticatedRequest) {
    return this.becomeProService.getMySummary(request.user.id);
  }

  @Post("seasons")
  @ApiOperation({ summary: "Start a season" })
  @ApiResponse({ status: 201, description: "The created season" })
  @ApiResponse({ status: 409, description: "That league year is already logged" })
  createSeason(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.meBecomeProService.createSeason(request.user.id, parseBody(createSeasonSchema, body));
  }

  @Patch("seasons/:seasonId")
  @ApiOperation({ summary: "Edit a season's details" })
  updateSeason(@Req() request: AuthenticatedRequest, @Param("seasonId") seasonId: string, @Body() body: unknown) {
    return this.meBecomeProService.updateSeason(request.user.id, seasonId, parseBody(updateSeasonSchema, body));
  }

  @Delete("seasons/:seasonId")
  @ApiOperation({ summary: "Delete a season and everything in it" })
  deleteSeason(@Req() request: AuthenticatedRequest, @Param("seasonId") seasonId: string) {
    return this.meBecomeProService.deleteSeason(request.user.id, seasonId);
  }

  @Post("seasons/:seasonId/games")
  @ApiOperation({ summary: "Log one game" })
  @ApiResponse({ status: 400, description: "The box score cannot be right" })
  @ApiResponse({ status: 409, description: "That game is already logged" })
  addGame(@Req() request: AuthenticatedRequest, @Param("seasonId") seasonId: string, @Body() body: unknown) {
    return this.meBecomeProService.addGame(request.user.id, seasonId, parseBody(gameSchema, body));
  }

  // Patched by the game's OWN id rather than nested under the season:
  // correcting a row must not require knowing which season it belongs to.
  @Patch("games/:gameId")
  @ApiOperation({ summary: "Correct a logged game" })
  updateGame(@Req() request: AuthenticatedRequest, @Param("gameId") gameId: string, @Body() body: unknown) {
    return this.meBecomeProService.updateGame(request.user.id, gameId, parseBody(updateGameSchema, body));
  }

  @Delete("games/:gameId")
  @ApiOperation({ summary: "Remove a logged game" })
  deleteGame(@Req() request: AuthenticatedRequest, @Param("gameId") gameId: string) {
    return this.meBecomeProService.deleteGame(request.user.id, gameId);
  }
}
