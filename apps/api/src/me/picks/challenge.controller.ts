import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import type { AuthenticatedRequest } from "./authenticated-request.js";
import { ChallengeService } from "./challenge.service.js";

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
  getNextChallenge(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    response.setHeader("Cache-Control", "no-store");
    return this.challengeService.getNextChallenge(request.user.id);
  }
}
