import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service.js";

// How long a per-request API usage row is kept. The rate limiter needs only
// today's rows and the profile and admin pages show recent use, so a quarter
// of a year is plenty; older rows only record which IP-less consumer called
// which route, long after anyone needs to know.
export const API_USAGE_RETENTION_IN_DAYS = 90;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** How many rows one retention run deleted, per table. */
export interface RetentionRunResult {
  expiredSessions: number;
  expiredVerifications: number;
  oldApiUsageRows: number;
}

/**
 * Deletes personal and usage records once nothing needs them (POPIA s14:
 * keep records no longer than the purpose requires).
 *
 * - Sessions past their expiry: BetterAuth never reads them again, but
 *   leaves them in the table.
 * - Verification rows past their expiry: one-time OAuth state, useless once
 *   expired.
 * - API usage rows older than API_USAGE_RETENTION_IN_DAYS.
 *
 * Runs daily. Live data (accounts, picks, saved items) is kept until the
 * user deletes it or their account, which cascades.
 */
@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: "data-retention" })
  async runScheduledCleanup(): Promise<void> {
    try {
      const result = await this.deleteExpiredRecords();
      this.logger.log(
        `Retention: deleted ${result.expiredSessions} expired sessions, ${result.expiredVerifications} expired verifications, ${result.oldApiUsageRows} old API usage rows`,
      );
    } catch (error) {
      this.logger.error(`Retention run failed: ${(error as Error).message}`);
    }
  }

  /**
   * Deletes everything past its retention period, as of now.
   *
   * @returns how many rows were deleted from each table.
   */
  async deleteExpiredRecords(now: Date = new Date()): Promise<RetentionRunResult> {
    const usageCutoff = new Date(now.getTime() - API_USAGE_RETENTION_IN_DAYS * MILLISECONDS_PER_DAY);
    const [sessions, verifications, usageRows] = await Promise.all([
      this.prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.apiUsageLog.deleteMany({ where: { calledAt: { lt: usageCutoff } } }),
    ]);
    return {
      expiredSessions: sessions.count,
      expiredVerifications: verifications.count,
      oldApiUsageRows: usageRows.count,
    };
  }
}
