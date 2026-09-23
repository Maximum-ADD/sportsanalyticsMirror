import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { parseBody } from "../../common/parse-body.js";
import { SessionAuthGuard } from "../../common/session-auth.guard.js";
import type { AuthenticatedRequest } from "./authenticated-request.js";
import { PickRecordService } from "./pick-record.service.js";
import { PicksService } from "./picks.service.js";

// The body of POST /v1/me/picks. Both ids are opaque uuids from a challenge
// payload the client was just served, so the schema only insists they are
// non-empty strings — whether they identify a real game, and whether that
// team is playing in it, are questions only the database can answer, and
// PicksService asks it. Unknown keys are stripped by parseBody, so a client
// cannot smuggle in an `outcome` and grade itself.
const createPickSchema = z.object({
  gameId: z.string().min(1),
  pickedTeamId: z.string().min(1),
});

@Controller("v1/me/picks")
@UseGuards(SessionAuthGuard)
export class PicksController {
  constructor(
    private readonly picksService: PicksService,
    private readonly pickRecordService: PickRecordService
  ) {}

  // GET /v1/me/picks/record — the signed-in user's win/loss record beside the
  // model's record over exactly the games that user called.
  @Get("record")
  getPickRecord(@Req() request: AuthenticatedRequest) {
    return this.pickRecordService.getPickRecord(request.user.id);
  }

  // POST /v1/me/picks — call a game; responds 201 with the graded result and
  // the final score, which this is the first response allowed to reveal.
  @Post()
  createPick(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.picksService.createPick(request.user.id, parseBody(createPickSchema, body));
  }
}
