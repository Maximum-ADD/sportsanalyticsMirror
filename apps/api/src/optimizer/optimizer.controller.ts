import { Controller, Get, HttpStatus, UseGuards } from "@nestjs/common";
import { ApiException } from "../common/api-exception.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { OptimizerService } from "./optimizer.service.js";

@Controller("v1/optimizer")
@UseGuards(SessionAuthGuard)
export class OptimizerController {
  constructor(private readonly optimizerService: OptimizerService) {}

  @Get("lineup")
  async getLatestLineup() {
    const lineup = await this.optimizerService.getLatestLineup();
    if (!lineup) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "No lineup has been generated yet — run predict.py then optimize.py in apps/optimizer."
      );
    }
    return lineup;
  }
}
