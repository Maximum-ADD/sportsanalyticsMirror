import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import type { AuthenticatedRequest } from "./authenticated-request.js";
import { ChallengeService } from "./challenge.service.js";

@ApiTags("me")
@Controller("v1/me/challenge")
@UseGuards(SessionAuthGuard)
export class ChallengeController {
  constructor(private readonly challengeService: ChallengeService) {}

  // GET /v1/me/challenge/next — one completed, model-predicted game the
  // signed-in user has not called yet, with the final score withheld.
  //
  // no-store because the answer changes the moment this user makes a call,
  // on the same URL: any cache that kept a copy (the browser's, or the
  // Cloudflare proxy's) would hand back the game just called. Set before the
  // service runs so the 404 for "nothing left" carries it too.
  @Get("next")
  @ApiOperation({ summary: "Next Beat the Model challenge: a finished, predicted game you have not called, score withheld" })
  @ApiResponse({ status: 404, description: "No uncalled games left" })
  getNextChallenge(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    response.setHeader("Cache-Control", "no-store");
    return this.challengeService.getNextChallenge(request.user.id);
  }
}
