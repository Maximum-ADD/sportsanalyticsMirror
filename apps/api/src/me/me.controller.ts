import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from "@nestjs/swagger";
import type { Request } from "express";
import { ApiException } from "../common/api-exception.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_SIZE_BYTES } from "./avatar-storage.service.js";
import { isValidUsername, MeService, type MeProfile } from "./me.service.js";

// Every route here requires a signed-in user, and every one of them acts on
// THAT user only — there is deliberately no :userId param anywhere in this
// controller, since "look up someone else's profile" isn't a feature this
// app has, and skipping the param removes an entire class of authorization
// bug (no id to double check against request.user.id).
// Exported for the other v1/me controller (SavedLineupsController), which
// lives in its own file but follows the same no-userId-param rule.
export function requestUserId(request: Request): string {
  // Populated by SessionAuthGuard from the BetterAuth session — see its own
  // doc comment. Narrow-cast the same way RolesGuard does for request.user,
  // rather than trusting `any`.
  return (request as unknown as { user: { id: string } }).user.id;
}

interface UpdateMeDto {
  username?: string;
  favoriteTeamId?: string | null;
}

@ApiTags("me")
@Controller("v1/me")
@UseGuards(SessionAuthGuard)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get()
  @ApiOperation({ summary: "Get the current user's profile" })
  @ApiResponse({ status: 200, description: "Current user's profile" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  getProfile(@Req() request: Request): Promise<MeProfile> {
    return this.meService.getProfile(requestUserId(request));
  }

  // PATCH /v1/me — updates username and/or favoriteTeamId. Both fields are
  // optional and independent: a request with only one of them leaves the
  // other untouched (see MeService.updateProfile), so the frontend's
  // separate "change username" and "change favorite team" controls don't
  // need to round-trip the field they're not editing.
  @Patch()
  @ApiOperation({ summary: "Update username and/or favorite team" })
  @ApiResponse({ status: 200, description: "Updated profile" })
  @ApiResponse({ status: 400, description: "Invalid username format" })
  @ApiResponse({ status: 409, description: "Username already taken" })
  async updateProfile(@Req() request: Request, @Body() body: UpdateMeDto): Promise<MeProfile> {
    const userId = requestUserId(request);

    if (body.username !== undefined) {
      if (!isValidUsername(body.username)) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "INVALID_USERNAME",
          "Username must be 3-20 characters, start with a letter, and contain only letters, numbers, and underscores"
        );
      }
      if (await this.meService.isUsernameTaken(body.username, userId)) {
        throw new ApiException(HttpStatus.CONFLICT, "USERNAME_TAKEN", "That username is already taken");
      }
    }

    // favoriteTeamId isn't validated against a real Team row here — an
    // invalid id simply fails the FK constraint below, which Postgres
    // reports the same way any other bad-reference bug would surface
    // during development. The frontend only ever sends ids it just fetched
    // from GET /v1/teams, so this isn't a realistic path for a real user to
    // hit.
    try {
      await this.meService.updateProfile(userId, body);
    } catch (error) {
      // Prisma's unique-constraint code — catches the rare TOCTOU race
      // between the isUsernameTaken check above and this write, not just
      // the common case (already handled above).
      if (isUniqueConstraintError(error)) {
        throw new ApiException(HttpStatus.CONFLICT, "USERNAME_TAKEN", "That username is already taken");
      }
      throw error;
    }

    return this.meService.getProfile(userId);
  }

  // POST /v1/me/avatar — multipart upload via multer's FileInterceptor
  // (NestJS's standard pattern). Validated here, before ever calling
  // Supabase, rather than trusting the client's reported mimetype from
  // startup config alone — file.mimetype is what multer read from the
  // multipart request itself, not just a file extension.
  @Post("avatar")
  @ApiOperation({ summary: "Upload a new avatar image" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } })
  @ApiResponse({ status: 200, description: "Signed URL for the new avatar" })
  @ApiResponse({ status: 400, description: "Invalid file type or size" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_AVATAR_SIZE_BYTES } }))
  async uploadAvatar(
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File | undefined
  ): Promise<{ avatarUrl: string | null }> {
    if (!file) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "No file was uploaded");
    }
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_FILE_TYPE",
        `Unsupported image type "${file.mimetype}" — only PNG, JPEG, and WebP are accepted`
      );
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "FILE_TOO_LARGE",
        `Image must be ${MAX_AVATAR_SIZE_BYTES / (1024 * 1024)}MB or smaller`
      );
    }

    const avatarUrl = await this.meService.updateAvatar(requestUserId(request), {
      buffer: file.buffer,
      mimetype: file.mimetype,
    });
    return { avatarUrl };
  }

  // PUT/DELETE rather than a single toggle endpoint: both are idempotent
  // (following an already-followed player, or unfollowing one that isn't,
  // is a success either way — see MeService), which is what makes PUT
  // correct here in the first place, and the two-verb shape mirrors how a
  // frontend "follow"/"unfollow" button naturally has two distinct actions
  // rather than one that needs to know the current state to decide what to
  // send.
  @Put("followed-players/:playerId")
  @ApiOperation({ summary: "Follow a player (idempotent)" })
  @ApiResponse({ status: 200, description: "Player is now followed" })
  async followPlayer(@Req() request: Request, @Param("playerId") playerId: string): Promise<{ following: true }> {
    await this.meService.followPlayer(requestUserId(request), playerId);
    return { following: true };
  }

  @Delete("followed-players/:playerId")
  @ApiOperation({ summary: "Unfollow a player (idempotent)" })
  @ApiResponse({ status: 200, description: "Player is no longer followed" })
  async unfollowPlayer(@Req() request: Request, @Param("playerId") playerId: string): Promise<{ following: false }> {
    await this.meService.unfollowPlayer(requestUserId(request), playerId);
    return { following: false };
  }
}

// Prisma throws a PrismaClientKnownRequestError with code "P2002" for a
// unique constraint violation. Narrow-checked structurally (duck-typed)
// rather than importing the Prisma error class, matching how ApiException
// itself avoids a hard dependency where a shape check will do.
function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
