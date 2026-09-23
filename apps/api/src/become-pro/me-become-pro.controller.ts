import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ApiException } from "../common/api-exception.js";
import { parseBody } from "../common/parse-body.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import type { AuthenticatedRequest } from "../me/picks/authenticated-request.js";
import { BecomeProService } from "./become-pro.service.js";
import { competitionLevelSchema } from "./competition-level.js";
import {
  ALLOWED_EVIDENCE_MIME_TYPES,
  MAX_EVIDENCE_SIZE_BYTES,
} from "./evidence-storage.service.js";
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
  isPublic: z.boolean().optional(),
});

const updateSeasonSchema = createSeasonSchema.partial();

// Bounds here are only what a number can physically be; whether a LINE is
// possible (makes against attempts, threes inside field goals) is decided by
// prospect-box-score.ts, which shares its rules with the admin anomaly
// checker rather than restating them in a schema.
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

/**
 * The signed-in user's own Become Pro data.
 *
 * Guarded by SessionAuthGuard alone, like every other /v1/me controller —
 * every route below is scoped to request.user.id, and an id in the URL is
 * never sufficient on its own.
 */
@ApiTags("become-pro")
@Controller("v1/me/become-pro")
@UseGuards(SessionAuthGuard)
export class MeBecomeProController {
  constructor(
    private readonly meBecomeProService: MeBecomeProService,
    private readonly becomeProService: BecomeProService
  ) {}

  // GET /v1/me/become-pro — the rank badge in the app header reads this on
  // every page, so it is deliberately join-free rather than the whole board.
  @Get()
  @ApiOperation({ summary: "Your own standing, for the header rank badge" })
  @ApiResponse({ status: 200, description: "Rank, latest value and value history" })
  getMyStanding(@Req() request: AuthenticatedRequest) {
    return this.becomeProService.getMyRankSummary(request.user.id);
  }

  @Post("seasons")
  @ApiOperation({ summary: "Start a season" })
  @ApiResponse({ status: 201, description: "The created season" })
  @ApiResponse({ status: 409, description: "That league year is already logged, or no username is set" })
  createSeason(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.meBecomeProService.createSeason(request.user.id, parseBody(createSeasonSchema, body));
  }

  @Patch("seasons/:seasonId")
  @ApiOperation({ summary: "Edit a season's details" })
  updateSeason(
    @Req() request: AuthenticatedRequest,
    @Param("seasonId") seasonId: string,
    @Body() body: unknown
  ) {
    return this.meBecomeProService.updateSeason(
      request.user.id,
      seasonId,
      parseBody(updateSeasonSchema, body)
    );
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
  addGame(
    @Req() request: AuthenticatedRequest,
    @Param("seasonId") seasonId: string,
    @Body() body: unknown
  ) {
    return this.meBecomeProService.addGame(request.user.id, seasonId, parseBody(gameSchema, body));
  }

  // Patched by the game's OWN id rather than nested under the season:
  // correcting a row must not require knowing which season it belongs to.
  @Patch("games/:gameId")
  @ApiOperation({ summary: "Correct a logged game (clears its verification)" })
  updateGame(
    @Req() request: AuthenticatedRequest,
    @Param("gameId") gameId: string,
    @Body() body: unknown
  ) {
    return this.meBecomeProService.updateGame(request.user.id, gameId, parseBody(updateGameSchema, body));
  }

  @Delete("games/:gameId")
  @ApiOperation({ summary: "Remove a logged game" })
  deleteGame(@Req() request: AuthenticatedRequest, @Param("gameId") gameId: string) {
    return this.meBecomeProService.deleteGame(request.user.id, gameId);
  }

  // Multipart, via multer's FileInterceptor — the same pattern POST
  // /v1/me/avatar uses, validated here before ever reaching Storage.
  @Post("seasons/:seasonId/evidence")
  @ApiOperation({ summary: "Upload a scoresheet backing this season up" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        gameIds: { type: "string" },
        wholeSeason: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 415, description: "Unsupported document type" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_EVIDENCE_SIZE_BYTES } }))
  addEvidence(
    @Req() request: AuthenticatedRequest,
    @Param("seasonId") seasonId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { gameIds?: string; wholeSeason?: string }
  ) {
    if (!file) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "No file was uploaded");
    }
    if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(file.mimetype)) {
      throw new ApiException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        "UNSUPPORTED_EVIDENCE_TYPE",
        `Unsupported document type "${file.mimetype}" — only PNG, JPEG, WebP and PDF are accepted`
      );
    }
    if (file.size > MAX_EVIDENCE_SIZE_BYTES) {
      throw new ApiException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        "EVIDENCE_TOO_LARGE",
        `Document must be ${MAX_EVIDENCE_SIZE_BYTES / (1024 * 1024)}MB or smaller`
      );
    }

    // Both arrive as strings: this is a multipart body, so there is no JSON
    // type information to rely on.
    const gameIds = body.gameIds?.split(",").map((id) => id.trim()).filter(Boolean);
    return this.meBecomeProService.addEvidence(request.user.id, seasonId, file, {
      gameIds,
      wholeSeason: body.wholeSeason === "true",
    });
  }

  @Delete("evidence/:evidenceId")
  @ApiOperation({ summary: "Remove an uploaded document" })
  deleteEvidence(@Req() request: AuthenticatedRequest, @Param("evidenceId") evidenceId: string) {
    return this.meBecomeProService.deleteEvidence(request.user.id, evidenceId);
  }
}
