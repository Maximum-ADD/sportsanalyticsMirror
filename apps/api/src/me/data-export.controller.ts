import { Controller, Get, HttpStatus, Req, Res, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { ApiException } from "../common/api-exception.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { DataExportService } from "./data-export.service.js";

const EXPORT_FILE_NAME = "nba-analytics-my-data.json";

@ApiTags("me")
@Controller("v1/me/export")
@UseGuards(SessionAuthGuard)
export class DataExportController {
  constructor(private readonly dataExportService: DataExportService) {}

  // GET /v1/me/export — the signed-in user's data as a JSON download. Session
  // only: an API key can never reach it (ApiKeyGuard isn't on this route).
  // no-store, so neither the browser nor the Cloudflare proxy keeps a copy.
  @Get()
  @ApiOperation({ summary: "Download everything the platform stores about your account, as JSON" })
  @ApiResponse({ status: 200, description: "JSON file attachment" })
  async exportMyData(@Req() request: { user: { id: string } }, @Res() response: Response): Promise<void> {
    const personalData = await this.dataExportService.exportPersonalData(request.user.id);
    if (!personalData) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Account not found");

    response
      .status(HttpStatus.OK)
      .set({
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${EXPORT_FILE_NAME}"`,
        "Cache-Control": "no-store",
      })
      .send(JSON.stringify(personalData, null, 2));
  }
}
