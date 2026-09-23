import { Body, Controller, Get, HttpStatus, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { EvidenceStatus } from "@prisma/client";
import { z } from "zod";
import { ApiException } from "../common/api-exception.js";
import { parsePageParams } from "../common/pagination.js";
import { parseBody, parseQueryParams } from "../common/parse-body.js";
import { Roles } from "../common/roles.decorator.js";
import { RolesGuard } from "../common/roles.guard.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import type { AuthenticatedRequest } from "../me/picks/authenticated-request.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BecomeProService } from "./become-pro.service.js";
import { EvidenceStorageService } from "./evidence-storage.service.js";

const MAX_REVIEW_NOTE_LENGTH = 500;

const queueQuerySchema = z.object({
  status: z.enum([EvidenceStatus.PENDING, EvidenceStatus.VERIFIED, EvidenceStatus.REJECTED]).optional(),
});

const reviewSchema = z.object({
  // Only the two terminal states: "un-reviewing" a document back to PENDING
  // is not a decision, and allowing it would let a verified season quietly
  // lose its backing with no record of who did it.
  status: z.enum([EvidenceStatus.VERIFIED, EvidenceStatus.REJECTED]),
  note: z.string().trim().max(MAX_REVIEW_NOTE_LENGTH).optional(),
});

/**
 * The evidence review queue.
 *
 * This exists because without it the whole verification half of Become Pro is
 * inert: nothing would ever leave PENDING, every prospect would sit at a
 * reliability of zero forever, and the value figure would be pinned to its
 * most demoted presentation. An upload queue nobody can empty is worse than
 * no upload at all, because it implies a check that never happens.
 */
@ApiTags("admin")
@Controller("v1/admin/become-pro")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdminBecomeProController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly becomeProService: BecomeProService,
    private readonly evidenceStorage: EvidenceStorageService
  ) {}

  // GET /v1/admin/become-pro/evidence?status=PENDING&page=&pageSize=
  @Get("evidence")
  @ApiOperation({ summary: "Uploaded prospect evidence awaiting review" })
  @ApiResponse({ status: 200, description: "One page of the review queue" })
  async listEvidence(@Query() query: Record<string, unknown>) {
    const { status } = parseQueryParams(queueQuerySchema, query);
    const pageParams = parsePageParams(query);
    const where = { status: status ?? EvidenceStatus.PENDING };

    const [rows, total] = await Promise.all([
      this.prisma.prospectEvidence.findMany({
        where,
        // Oldest first: a review queue is worked front to back, and the
        // longest-waiting upload is the one that should be seen next.
        orderBy: { uploadedAt: "asc" },
        skip: (pageParams.page - 1) * pageParams.pageSize,
        take: pageParams.pageSize,
        include: {
          season: { include: { user: { select: { username: true, name: true } }, games: { select: { id: true, evidenceId: true } } } },
        },
      }),
      this.prisma.prospectEvidence.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        seasonId: row.seasonId,
        fileName: row.fileName,
        // An admin is one of the two parties who may see the file itself —
        // the owner is the other. Everyone else gets the status alone.
        fileUrl: await this.evidenceStorage.createSignedEvidenceUrl(row.objectPath),
        mimeType: row.mimeType,
        status: row.status,
        reviewedAt: row.reviewedAt,
        reviewNote: row.reviewNote,
        gamesCovered: row.season.games.filter((game) => game.evidenceId === row.id).length,
        uploadedAt: row.uploadedAt,
        owner: {
          username: row.season.user.username ?? "",
          displayName: row.season.user.username ?? row.season.user.name,
        },
      }))
    );

    return { data, page: pageParams.page, pageSize: pageParams.pageSize, total };
  }

  @Patch("evidence/:evidenceId")
  @ApiOperation({ summary: "Verify or reject one uploaded document" })
  @ApiResponse({ status: 200, description: "The reviewed document" })
  @ApiResponse({ status: 404, description: "No such document" })
  async reviewEvidence(
    @Req() request: AuthenticatedRequest,
    @Param("evidenceId") evidenceId: string,
    @Body() body: unknown
  ) {
    const payload = parseBody(reviewSchema, body);

    const existing = await this.prisma.prospectEvidence.findUnique({ where: { id: evidenceId } });
    if (!existing) {
      throw new ApiException(HttpStatus.NOT_FOUND, "EVIDENCE_NOT_FOUND", "No such document");
    }

    const reviewed = await this.prisma.prospectEvidence.update({
      where: { id: evidenceId },
      data: {
        status: payload.status,
        reviewedById: request.user.id,
        reviewedAt: new Date(),
        // Recorded on both outcomes, not only rejections: an approval with a
        // note ("checked against the league site") is worth keeping, and the
        // owner is only ever shown the note on a rejection anyway.
        reviewNote: payload.note ?? null,
      },
    });

    // The decision changes a reliability score, which changes how the value
    // figure is presented and can change the board's tiebreak order.
    this.becomeProService.invalidate();
    return reviewed;
  }
}
