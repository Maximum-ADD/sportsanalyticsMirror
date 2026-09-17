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
} from "@nestjs/common";
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
