import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { IngestionBatchStatus, Role } from "@prisma/client";
import { ApiException } from "../common/api-exception.js";
import { Roles } from "../common/roles.decorator.js";
import { RolesGuard } from "../common/roles.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { AdminBatchesService } from "./admin-batches.service.js";

function parseReviewBody(body: unknown): { reviewNotes?: string } {
  if (typeof body !== "object" || body === null) return {};
  const raw = body as Record<string, unknown>;
  if (typeof raw.reviewNotes === "string" && raw.reviewNotes.trim().length > 0) {
    return { reviewNotes: raw.reviewNotes.trim() };
  }
  return {};
}

@ApiTags("admin")
@Controller("v1/admin/batches")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminBatchesController {
  constructor(private readonly adminBatchesService: AdminBatchesService) {}

  @Get()
  @ApiOperation({ summary: "List ingestion batches (paginated, admin only)" })
  @ApiQuery({ name: "status", required: false, description: "Filter by status (e.g. PENDING_REVIEW)" })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Paginated batch list" })
  listBatches(@Query() query: Record<string, unknown>) {
    return this.adminBatchesService.listBatches(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single ingestion batch with details (admin only)" })
  @ApiParam({ name: "id", description: "Batch UUID" })
  @ApiResponse({ status: 200, description: "Batch details" })
  @ApiResponse({ status: 404, description: "Batch not found" })
  async getBatch(@Param("id") id: string) {
    const batch = await this.adminBatchesService.getBatchById(id);
    if (!batch) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Batch not found");
    }
    return batch;
  }

  @Post(":id/approve")
  @ApiOperation({ summary: "Approve a pending batch (admin only)" })
  @ApiParam({ name: "id", description: "Batch UUID" })
  @ApiResponse({ status: 200, description: "Batch approved" })
  @ApiResponse({ status: 400, description: "Batch not in PENDING_REVIEW status" })
  @ApiResponse({ status: 404, description: "Batch not found" })
  async approveBatch(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: { user: { id: string } },
  ) {
    const batch = await this.adminBatchesService.getBatchById(id);
    if (!batch) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Batch not found");
    }
    if (batch.status !== IngestionBatchStatus.PENDING_REVIEW) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "BAD_REQUEST",
        `Batch is ${batch.status}, not PENDING_REVIEW`,
      );
    }
    const { reviewNotes } = parseReviewBody(body);
    return this.adminBatchesService.approveBatch(id, request.user.id, reviewNotes);
  }

  @Post(":id/reject")
  @ApiOperation({ summary: "Reject a pending batch (admin only)" })
  @ApiParam({ name: "id", description: "Batch UUID" })
  @ApiResponse({ status: 200, description: "Batch rejected" })
  @ApiResponse({ status: 400, description: "Batch not in PENDING_REVIEW status" })
  @ApiResponse({ status: 404, description: "Batch not found" })
  async rejectBatch(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: { user: { id: string } },
  ) {
    const batch = await this.adminBatchesService.getBatchById(id);
    if (!batch) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Batch not found");
    }
    if (batch.status !== IngestionBatchStatus.PENDING_REVIEW) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "BAD_REQUEST",
        `Batch is ${batch.status}, not PENDING_REVIEW`,
      );
    }
    const { reviewNotes } = parseReviewBody(body);
    return this.adminBatchesService.rejectBatch(id, request.user.id, reviewNotes);
  }
}
