import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import type { AuthenticatedRequest } from "./authenticated-request.js";
import { ChallengeService } from "./challenge.service.js";

@Controller("v1/me/challenge")
@UseGuards(SessionAuthGuard)
export class ChallengeController {
  constructor(private readonly challengeService: ChallengeService) {}

  // GET /v1/me/challenge/next — one completed, model-predicted game the
  // signed-in user has not called yet, with the final score withheld.
  @Get("next")
  getNextChallenge(@Req() request: AuthenticatedRequest) {
    return this.challengeService.getNextChallenge(request.user.id);
  }
}
