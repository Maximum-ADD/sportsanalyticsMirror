import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Role } from "@prisma/client";
import { ApiException } from "../common/api-exception.js";
import { Roles } from "../common/roles.decorator.js";
import { RolesGuard } from "../common/roles.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { DatasetReleasesService, type ReleaseWithPublisher } from "./datasets.service.js";

export function parsePublishBody(body: unknown): { version: string; description: string; season: string } {
  if (typeof body !== "object" || body === null) {
    throw new Error("Request body must be an object");
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.version !== "string" || raw.version.trim().length === 0) {
    throw new Error("version is required and must be a non-empty string");
  }
  if (typeof raw.description !== "string" || raw.description.trim().length === 0) {
    throw new Error("description is required and must be a non-empty string");
  }
  if (typeof raw.season !== "string" || raw.season.trim().length === 0) {
    throw new Error("season is required and must be a non-empty string (e.g. '2025-26')");
  }

  return {
    version: raw.version.trim(),
    description: raw.description.trim(),
    season: raw.season.trim(),
  };
}

@ApiTags("datasets")
@Controller("v1/datasets")
export class DatasetReleasesController {
  constructor(private readonly datasetsService: DatasetReleasesService) {}

  // GET /v1/datasets — public paginated list of all published releases.
  @Get()
  @ApiOperation({ summary: "List all published dataset releases" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Paginated release list" })
  listReleases(@Query() query: Record<string, unknown>) {
    return this.datasetsService.listReleases(query);
  }

  @Get("diff")
  @ApiOperation({ summary: "Compare release metadata and schema" })
  @ApiQuery({ name: "from", required: true, description: "Earlier release version" })
  @ApiQuery({ name: "to", required: true, description: "Later release version" })
  @ApiResponse({ status: 200, description: "Release metadata differences" })
  @ApiResponse({ status: 404, description: "One or both releases not found" })
  async diffReleases(@Query("from") fromVersion: string, @Query("to") toVersion: string) {
    const result = await this.datasetsService.diffReleases(fromVersion, toVersion);
    if (!result) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "One or both dataset releases were not found");
    return result;
  }

  @Get("changes")
  @ApiOperation({ summary: "List dataset releases published after a cursor" })
  @ApiQuery({ name: "since", required: true, description: "ISO-8601 timestamp cursor" })
  async getChanges(@Query("since") rawSince: string) {
    const since = new Date(rawSince);
    if (Number.isNaN(since.getTime())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "since must be an ISO-8601 timestamp");
    }
    const changes = await this.datasetsService.getChangesSince(since);
    return { changes, nextSince: changes.at(-1)?.publishedAt.toISOString() ?? rawSince };
  }

  // GET /v1/datasets/:version — single release with field schema and checksum.
  @Get(":version")
  @ApiOperation({ summary: "Get a single dataset release by version" })
  @ApiParam({ name: "version", description: "Release version (e.g. '2025-26.1')" })
  @ApiResponse({ status: 200, description: "Release details" })
  @ApiResponse({ status: 404, description: "Release not found" })
  async getRelease(@Param("version") version: string): Promise<ReleaseWithPublisher> {
    const release = await this.datasetsService.getReleaseByVersion(version);
    if (!release) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Release not found");
    }
    return release;
  }

  // GET /v1/datasets/:version/download — generates CSV and returns it as a file.
  @Get(":version/download")
  @ApiOperation({ summary: "Download a dataset release as CSV" })
  @ApiParam({ name: "version", description: "Release version" })
  @ApiResponse({ status: 200, description: "CSV file" })
  @ApiResponse({ status: 404, description: "Release not found" })
  @ApiResponse({ status: 409, description: "Release is stale after a source correction" })
  async downloadRelease(@Param("version") version: string, @Res() res: Response): Promise<void> {
    const result = await this.datasetsService.downloadRelease(version);
    if (result.kind === "missing") {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Release not found");
    }
    if (result.kind === "stale") {
      throw new ApiException(HttpStatus.CONFLICT, "STALE_DATASET_RELEASE", "Release is stale after a correction; publish a replacement release before downloading");
    }

    res
      .status(HttpStatus.OK)
      .set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dataset-${version}.csv"`,
        "X-Checksum-SHA256": result.checksum,
      })
      .send(result.csv);
  }

  // POST /v1/admin/datasets/publish — admin-only: create a new release.
  @Post("admin/publish")
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Publish a new dataset release (admin only)" })
  @ApiResponse({ status: 201, description: "Release published" })
  @ApiResponse({ status: 400, description: "Invalid request body" })
  async publishRelease(
    @Body() body: unknown,
    @Req() request: { user: { id: string } },
  ) {
    let params;
    try {
      params = parsePublishBody(body);
    } catch (err) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", (err as Error).message);
    }

    return this.datasetsService.publishRelease({
      ...params,
      publishedById: request.user.id,
    });
  }
}
