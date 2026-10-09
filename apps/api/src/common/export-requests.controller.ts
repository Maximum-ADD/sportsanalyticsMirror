import { Controller, Get, HttpStatus, Param, Res, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { ApiException } from "./api-exception.js";
import { ApiKeyGuard } from "./api-key.guard.js";
import { OptionalSessionGuard } from "./optional-session.guard.js";
import { ApiKeyOrSessionAccess, ApiNotFoundError } from "./openapi/api-docs.decorators.js";
import { ExportRequestsService } from "./export-requests.service.js";

// Resource-agnostic status/download for a queued export (see
// ExportRequestsService) — a caller polls GET /v1/exports/:id until status
// is SUCCEEDED or FAILED, then downloads the CSV. Same auth as the export
// endpoints that create these requests (players/games), since the id
// alone is the only credential a poll needs, matching DatasetRelease's own
// publicly-downloadable-by-id shape.
@ApiTags("exports")
@UseGuards(OptionalSessionGuard, ApiKeyGuard)
@ApiKeyOrSessionAccess()
@Controller("v1/exports")
export class ExportRequestsController {
  constructor(private readonly exportRequests: ExportRequestsService) {}

  @Get(":id")
  @ApiOperation({ summary: "Status of a queued export (players or games)" })
  @ApiParam({ name: "id", description: "Export request UUID" })
  @ApiResponse({ status: 200, description: "Export status" })
  @ApiNotFoundError("Export request not found")
  async getExport(@Param("id") id: string) {
    const request = await this.exportRequests.getExportById(id);
    if (!request) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Export request not found");
    }
    return request;
  }

  @Get(":id/download")
  @ApiOperation({ summary: "Download a SUCCEEDED export's CSV" })
  @ApiParam({ name: "id", description: "Export request UUID" })
  @ApiResponse({ status: 200, description: "CSV file" })
  @ApiResponse({ status: 404, description: "Not found, not finished yet, or past its retention window" })
  async downloadExport(@Param("id") id: string, @Res() response: Response): Promise<void> {
    const result = await this.exportRequests.getExportCsv(id);
    if (!result) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Export not found, not finished yet, or past its retention window",
      );
    }
    const filename = result.resource === "PLAYERS" ? "players.csv" : "games.csv";
    response
      .status(HttpStatus.OK)
      .set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      })
      .send(result.csv);
  }
}
