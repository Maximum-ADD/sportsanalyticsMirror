import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Body,
  UseGuards,
  Req,
  HttpStatus,
} from "@nestjs/common";
import { ApiException } from "../common/api-exception.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { RolesGuard } from "../common/roles.guard.js";
import { Roles } from "../common/roles.decorator.js";
import {
  AdminIngestionService,
  IngestionFrequency,
  PullOptions,
} from "./admin-ingestion.service.js";

@Controller("v1/admin/ingestion")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdminIngestionController {
  constructor(private readonly ingestionService: AdminIngestionService) {}

  /**
   * GET /v1/admin/ingestion/schedule
   * Returns the current schedule configuration.
   */
  @Get("schedule")
  async getSchedule() {
    return this.ingestionService.getSchedule();
  }

  /**
   * PUT /v1/admin/ingestion/schedule
   * Updates the schedule configuration.
   */
  @Put("schedule")
  async updateSchedule(
    @Body() body: { frequency: IngestionFrequency },
    @Req() request: { user: { id: string } },
  ) {
    return this.ingestionService.updateSchedule(body.frequency, request.user.id);
  }

  /**
   * POST /v1/admin/ingestion/pull
   * Triggers a manual ingestion pull.
   *
   * The optional body narrows what the pull covers: a season, and a
   * from/to date window inside it. An empty body keeps the previous
   * behaviour — the current season's recent games plus the postseason.
   */
  @Post("pull")
  async triggerPull(
    @Req() request: { user: { id: string } },
    @Body() body: PullOptions = {},
  ) {
    return this.ingestionService.triggerPull(request.user.id, {
      season: body?.season,
      fromDate: body?.fromDate,
      toDate: body?.toDate,
    });
  }

  /**
   * GET /v1/admin/ingestion/requests
   * The most recent queued pulls and how each ended — what the admin page
   * shows while the deployed API waits on a pull worker.
   */
  @Get("requests")
  async listPullRequests() {
    return this.ingestionService.listPullRequests();
  }

  /**
   * POST /v1/admin/ingestion/requests/:id/cancel
   * Cancels a queued pull no worker has picked up yet. A running pull is
   * on another machine and can't be stopped from here, so 409 for those.
   */
  @Post("requests/:id/cancel")
  async cancelPullRequest(@Param("id") id: string) {
    const cancelled = await this.ingestionService.cancelPullRequest(id);
    if (!cancelled) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "NOT_CANCELLABLE",
        "Only a queued pull can be cancelled; this one is running, finished or doesn't exist.",
      );
    }
    return { cancelled: true };
  }

  /**
   * DELETE /v1/admin/ingestion/batches/:id
   * Soft-deletes a batch.
   */
  @Delete("batches/:id")
  async deleteBatch(
    @Param("id") id: string,
    @Req() request: { user: { id: string } },
  ) {
    const deleted = await this.ingestionService.deleteBatch(id, request.user.id);
    return { success: deleted };
  }
}
