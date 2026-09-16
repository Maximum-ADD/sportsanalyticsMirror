import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { PrismaService } from "../prisma/prisma.service.js";

const execFileAsync = promisify(execFile);

export type IngestionFrequency = "NEVER" | "HOURLY" | "DAILY" | "WEEKLY";

export interface ScheduleConfig {
  frequency: IngestionFrequency;
  lastRunAt: Date | null;
  updatedAt: Date;
}

export interface TriggerResult {
  started: boolean;
  message: string;
}

@Injectable()
export class AdminIngestionService {
  private readonly logger = new Logger(AdminIngestionService.name);
  private readonly pythonPath: string;
  private readonly ingestionDir: string;

  constructor(private readonly prisma: PrismaService) {
    // Resolve the ingestion directory relative to the API working directory.
    // Works both locally (cwd = apps/api) and on Render (rootDir = apps/api).
    this.ingestionDir = join(process.cwd(), "..", "ingestion");

    // Platform-aware Python path:
    // Windows: .venv\Scripts\python.exe
    // Linux/macOS: .venv/bin/python
    const venvDir = join(this.ingestionDir, ".venv");
    if (process.platform === "win32") {
      this.pythonPath = join(venvDir, "Scripts", "python.exe");
    } else {
      this.pythonPath = join(venvDir, "bin", "python");
    }
  }

  /**
   * Get the current schedule configuration.
   */
  async getSchedule(): Promise<ScheduleConfig> {
    const schedule = await this.prisma.ingestionSchedule.findUnique({
      where: { id: "singleton" },
    });

    if (!schedule) {
      // Return default if no schedule exists yet
      return {
        frequency: "NEVER",
        lastRunAt: null,
        updatedAt: new Date(),
      };
    }

    return {
      frequency: schedule.frequency as IngestionFrequency,
      lastRunAt: schedule.lastRunAt,
      updatedAt: schedule.updatedAt,
    };
  }

  /**
   * Update the schedule configuration.
   */
  async updateSchedule(
    frequency: IngestionFrequency,
    userId: string,
  ): Promise<ScheduleConfig> {
    const schedule = await this.prisma.ingestionSchedule.upsert({
      where: { id: "singleton" },
      update: {
        frequency,
        updatedById: userId,
      },
      create: {
        id: "singleton",
        frequency,
        updatedById: userId,
      },
    });

    return {
      frequency: schedule.frequency as IngestionFrequency,
      lastRunAt: schedule.lastRunAt,
      updatedAt: schedule.updatedAt,
    };
  }

  /**
   * Trigger a manual ingestion pull.
   * Spawns the Python ingestion script with --review flag so batches
   * land as PENDING_REVIEW for admin approval.
   */
  async triggerPull(_userId?: string): Promise<TriggerResult> {
    try {
      // Verify the ingestion environment is available before trying to spawn.
      const scriptPath = join(this.ingestionDir, "ingest.py");
      if (!existsSync(scriptPath)) {
        return {
          started: false,
          message: "Ingestion scripts not found on this server. Run ingestion from a machine with the Python environment set up.",
        };
      }
      if (!existsSync(this.pythonPath)) {
        return {
          started: false,
          message: "Python virtual environment not found. Run `pip install -r requirements.txt` in apps/ingestion first.",
        };
      }

      this.logger.log("Triggering manual ingestion pull...");

      const { stdout, stderr } = await execFileAsync(
        this.pythonPath,
        [scriptPath, "--review"],
        {
          cwd: this.ingestionDir,
          timeout: 300_000, // 5 minute timeout
        },
      );

      this.logger.log(`Ingestion stdout: ${stdout}`);
      if (stderr) {
        this.logger.warn(`Ingestion stderr: ${stderr}`);
      }

      // Update lastRunAt
      await this.prisma.ingestionSchedule.update({
        where: { id: "singleton" },
        data: { lastRunAt: new Date() },
      }).catch(() => {
        // Schedule might not exist yet, that's fine
      });

      return {
        started: true,
        message: "Ingestion triggered successfully. Check the Batches tab for new data.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Ingestion failed: ${message}`);

      return {
        started: false,
        message: `Ingestion failed: ${message}`,
      };
    }
  }

  /**
   * Delete a batch and its associated data.
   * Soft-deletes by setting deletedAt.
   */
  async deleteBatch(batchId: string, userId: string): Promise<boolean> {
    const batch = await this.prisma.ingestionBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch || batch.deletedAt) {
      return false;
    }

    await this.prisma.ingestionBatch.update({
      where: { id: batchId },
      data: {
        deletedAt: new Date(),
        deletedById: userId,
      },
    });

    return true;
  }

  /**
   * Scheduled check — runs every hour and decides whether to pull
   * based on the configured frequency.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkSchedule(): Promise<void> {
    const schedule = await this.getSchedule();

    if (schedule.frequency === "NEVER") {
      return;
    }

    const now = new Date();
    const lastRun = schedule.lastRunAt;

    let shouldRun = false;

    if (!lastRun) {
      // Never run before — run now
      shouldRun = true;
    } else {
      const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);

      switch (schedule.frequency) {
        case "HOURLY":
          shouldRun = hoursSinceLastRun >= 1;
          break;
        case "DAILY":
          shouldRun = hoursSinceLastRun >= 24;
          break;
        case "WEEKLY":
          shouldRun = hoursSinceLastRun >= 168; // 7 * 24
          break;
      }
    }

    if (shouldRun) {
      this.logger.log(`Scheduled ingestion: frequency=${schedule.frequency}, lastRun=${lastRun?.toISOString() ?? "never"}`);
      await this.triggerPull();
    }
  }
}
