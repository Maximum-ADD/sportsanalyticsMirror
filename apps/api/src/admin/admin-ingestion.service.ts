import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { PrismaService } from "../prisma/prisma.service.js";

export type IngestionFrequency = "NEVER" | "HOURLY" | "DAILY" | "WEEKLY";

export interface ScheduleConfig {
  frequency: IngestionFrequency;
  lastRunAt: Date | null;
  updatedAt: Date;
  /** False where the Python ingestion environment is absent (e.g. Render),
   * so callers can explain that pulls only run on machines that have it. */
  ingestionAvailable: boolean;
}

export interface TriggerResult {
  started: boolean;
  message: string;
}

/** Which games a manual pull should cover. Every field is optional: an
 * empty request keeps the previous behaviour — the current season's recent
 * games plus the whole postseason. */
export interface PullOptions {
  season?: string;
  fromDate?: string;
  toDate?: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Matches "2025-26". The ingestion script validates this too, but rejecting
// it here means a typo comes back as a message in the admin UI rather than
// as a process that exits 40 minutes later.
const SEASON_PATTERN = /^\d{4}-\d{2}$/;

/**
 * Turns pull options into ingest.py's command-line arguments.
 *
 * Exported for testing: these flags are a contract with the Python script
 * (see apps/ingestion/test_ingest_args.py), and a mismatch would only show
 * up as a pull that silently ingests the wrong games.
 *
 * Throws when a value is malformed or the window is inverted, so the caller
 * can report it instead of spawning a doomed run.
 */
export function buildIngestionArgs(options: PullOptions): string[] {
  const args = ["--review"];

  if (options.season) {
    if (!SEASON_PATTERN.test(options.season)) {
      throw new Error(`season must look like 2025-26, got "${options.season}"`);
    }
    args.push("--season", options.season);
  }

  for (const [flag, value] of [
    ["--from-date", options.fromDate],
    ["--to-date", options.toDate],
  ] as const) {
    if (!value) continue;
    if (!ISO_DATE_PATTERN.test(value)) {
      throw new Error(`${flag} must be a YYYY-MM-DD date, got "${value}"`);
    }
    args.push(flag, value);
  }

  if (options.fromDate && options.toDate && options.fromDate > options.toDate) {
    throw new Error("from-date must not be after to-date");
  }

  return args;
}

@Injectable()
export class AdminIngestionService {
  private readonly logger = new Logger(AdminIngestionService.name);
  private readonly pythonPath: string;
  private readonly ingestionDir: string;
  /** Handle of the pull process currently in flight, if any. */
  private runningProcess: ChildProcess | null = null;

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
   * Whether this machine can actually run a pull — the ingestion scripts
   * and Python virtualenv must exist next to the API (true in local dev,
   * false on Render, where apps/ingestion is not deployed).
   */
  isIngestionAvailable(): boolean {
    return this.missingIngestionPrerequisite() === null;
  }

  private missingIngestionPrerequisite(): string | null {
    if (!existsSync(join(this.ingestionDir, "ingest.py"))) {
      return "Ingestion scripts not found on this server. Run ingestion from a machine with the Python environment set up.";
    }
    if (!existsSync(this.pythonPath)) {
      return "Python virtual environment not found. Run `pip install -r requirements.txt` in apps/ingestion first.";
    }
    return null;
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
        ingestionAvailable: this.isIngestionAvailable(),
      };
    }

    return {
      frequency: schedule.frequency as IngestionFrequency,
      lastRunAt: schedule.lastRunAt,
      updatedAt: schedule.updatedAt,
      ingestionAvailable: this.isIngestionAvailable(),
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
      ingestionAvailable: this.isIngestionAvailable(),
    };
  }

  /**
   * Trigger a manual ingestion pull.
   * Spawns the Python ingestion script with --review flag so batches
   * land as PENDING_REVIEW for admin approval. Only one pull can run at
   * a time — a full run is ~45 minutes of throttled NBA API calls, and
   * overlapping runs would duplicate every PENDING_REVIEW batch (safe,
   * since writes are upserts, but wasteful and noisy to review).
   */
  async triggerPull(_userId?: string, options: PullOptions = {}): Promise<TriggerResult> {
    if (this.runningProcess) {
      return {
        started: false,
        message: "A pull is already running. Check the Batches tab and try again once it finishes.",
      };
    }

    // Reject a malformed season or date window before anything is spawned,
    // so the admin sees the reason rather than an empty pull.
    let ingestionArgs: string[];
    try {
      ingestionArgs = buildIngestionArgs(options);
    } catch (error) {
      return { started: false, message: (error as Error).message };
    }

    try {
      // Verify the ingestion environment is available before trying to spawn.
      const scriptPath = join(this.ingestionDir, "ingest.py");
      const unavailable = this.missingIngestionPrerequisite();
      if (unavailable) {
        return { started: false, message: unavailable };
      }

      this.logger.log(`Triggering manual ingestion pull: ${ingestionArgs.join(" ")}`);

      const ingestionProcess = spawn(this.pythonPath, [scriptPath, ...ingestionArgs], {
        cwd: this.ingestionDir,
        detached: true,
        stdio: "ignore",
      });
      this.runningProcess = ingestionProcess;
      ingestionProcess.unref();
      ingestionProcess.once("error", (error) => {
        this.runningProcess = null;
        this.logger.error(`Ingestion process failed to start: ${error.message}`);
      });
      ingestionProcess.once("exit", (exitCode) => {
        this.runningProcess = null;
        if (exitCode === 0) {
          void this.recordCompletedRun();
        } else {
          this.logger.error(`Ingestion process exited with code ${exitCode ?? "unknown"}`);
        }
      });

      return {
        started: true,
        message: "Ingestion queued. Check the Batches tab for progress and review.",
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

  private async recordCompletedRun(): Promise<void> {
    await this.prisma.ingestionSchedule.update({
      where: { id: "singleton" },
      data: { lastRunAt: new Date() },
    }).catch(() => undefined);
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
    // The cron runs on every deployment, but only machines with the Python
    // ingestion environment can actually pull — skip silently elsewhere
    // instead of pointlessly re-checking the schedule every hour.
    if (!this.isIngestionAvailable()) {
      return;
    }

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
