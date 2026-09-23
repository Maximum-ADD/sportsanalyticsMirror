import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { IngestionRequestStatus, type IngestionSchedule } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

export type IngestionFrequency = "NEVER" | "HOURLY" | "DAILY" | "WEEKLY";

/**
 * How this server carries out a pull.
 * - "direct": it has the Python ingestion environment and spawns ingest.py
 *   itself (local development).
 * - "queue": it can't run ingestion (the deployed API: no Python there, and
 *   stats.nba.com blocks cloud IPs anyway), so it records an
 *   IngestionRequest for a pull worker on another machine to run.
 */
export type PullMode = "direct" | "queue";

export interface ScheduleConfig {
  frequency: IngestionFrequency;
  lastRunAt: Date | null;
  updatedAt: Date;
  /** True only when this server runs pulls itself (pullMode "direct"). Kept
   * for existing callers; new code should read pullMode. */
  ingestionAvailable: boolean;
  pullMode: PullMode;
  /** When any pull worker last checked in; null if none ever has. Only
   * meaningful in queue mode, where a pull waits for a worker. */
  workerLastSeenAt: Date | null;
}

export interface TriggerResult {
  started: boolean;
  message: string;
  /** True when the pull was queued for a worker rather than run here. */
  queued?: boolean;
}

export interface PullRequestSummary {
  id: string;
  status: IngestionRequestStatus;
  season: string | null;
  fromDate: string | null;
  toDate: string | null;
  scheduled: boolean;
  requestedAt: Date;
  claimedBy: string | null;
  claimedAt: Date | null;
  finishedAt: Date | null;
  message: string | null;
  requestedBy: { id: string; name: string } | null;
}

// A full pull takes 35-45 minutes. A request still RUNNING well past that
// belongs to a worker that died mid-run; it stops counting as "in flight",
// so it can't block new requests forever.
const ORPHANED_RUN_AFTER_HOURS = 3;
// How many recent requests the admin page shows.
const PULL_REQUEST_HISTORY_LIMIT = 10;
// INGESTION_MODE=queue forces queue mode on a machine that could run pulls
// itself — how the whole queue-and-worker flow is exercised locally.
const FORCED_QUEUE_MODE = "queue";

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
   * How this server carries out a pull — see PullMode. Queue mode when the
   * ingestion environment is missing, or when INGESTION_MODE=queue forces it.
   */
  getPullMode(): PullMode {
    if (process.env.INGESTION_MODE === FORCED_QUEUE_MODE) return "queue";
    return this.isIngestionAvailable() ? "direct" : "queue";
  }

  /** When any pull worker last checked in, or null if none ever has. */
  async getWorkerLastSeenAt(): Promise<Date | null> {
    const newest = await this.prisma.ingestionWorker.findFirst({
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true },
    });
    return newest?.lastSeenAt ?? null;
  }

  /** Shapes a stored schedule (or the default, if none exists yet) with
   * this server's pull mode and worker status. */
  private async toScheduleConfig(schedule: IngestionSchedule | null): Promise<ScheduleConfig> {
    const pullMode = this.getPullMode();
    return {
      frequency: (schedule?.frequency ?? "NEVER") as IngestionFrequency,
      lastRunAt: schedule?.lastRunAt ?? null,
      updatedAt: schedule?.updatedAt ?? new Date(),
      ingestionAvailable: pullMode === "direct",
      pullMode,
      workerLastSeenAt: await this.getWorkerLastSeenAt(),
    };
  }

  /**
   * Get the current schedule configuration.
   */
  async getSchedule(): Promise<ScheduleConfig> {
    const schedule = await this.prisma.ingestionSchedule.findUnique({
      where: { id: "singleton" },
    });
    return this.toScheduleConfig(schedule);
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
    return this.toScheduleConfig(schedule);
  }

  /**
   * Trigger a manual ingestion pull.
   * Spawns the Python ingestion script with --review flag so batches
   * land as PENDING_REVIEW for admin approval. Only one pull can run at
   * a time — a full run is ~45 minutes of throttled NBA API calls, and
   * overlapping runs would duplicate every PENDING_REVIEW batch (safe,
   * since writes are upserts, but wasteful and noisy to review).
   */
  async triggerPull(userId?: string, options: PullOptions = {}): Promise<TriggerResult> {
    // Reject a malformed season or date window before anything is spawned
    // or queued, so the admin sees the reason rather than an empty pull.
    let ingestionArgs: string[];
    try {
      ingestionArgs = buildIngestionArgs(options);
    } catch (error) {
      return { started: false, message: (error as Error).message };
    }

    if (this.getPullMode() === "queue") {
      return this.queuePull(options, { requestedById: userId ?? null, scheduled: false });
    }
    return this.spawnPull(ingestionArgs);
  }

  /** Runs ingest.py on this machine (direct mode). */
  private spawnPull(ingestionArgs: string[]): TriggerResult {
    if (this.runningProcess) {
      return {
        started: false,
        message: "A pull is already running. Check the Batches tab and try again once it finishes.",
      };
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
   * Records a pull for a pull worker to run (queue mode).
   *
   * At most one request is in flight at a time — queued, or running and
   * not orphaned — for the same reason only one direct pull runs at once:
   * overlapping pulls duplicate every PENDING_REVIEW batch. It also stops
   * an hourly schedule piling up requests while no worker is online.
   * Options are assumed already validated (triggerPull does that).
   */
  async queuePull(
    options: PullOptions,
    origin: { requestedById: string | null; scheduled: boolean },
  ): Promise<TriggerResult> {
    const outstanding = await this.findOutstandingRequest();
    if (outstanding) {
      return {
        started: false,
        message:
          outstanding.status === IngestionRequestStatus.RUNNING
            ? `A pull is already running on ${outstanding.claimedBy ?? "a pull worker"}. Try again once it finishes.`
            : "A pull is already queued. Cancel it, or wait for it to run, before queuing another.",
      };
    }

    await this.prisma.ingestionRequest.create({
      data: {
        season: options.season ?? null,
        fromDate: options.fromDate ?? null,
        toDate: options.toDate ?? null,
        scheduled: origin.scheduled,
        requestedById: origin.requestedById,
      },
    });
    this.logger.log(`Queued ${origin.scheduled ? "scheduled" : "manual"} pull: ${buildIngestionArgs(options).join(" ")}`);

    return {
      started: true,
      queued: true,
      message: "Queued. It runs when a pull worker next checks in — progress shows in the queue below.",
    };
  }

  /** The request currently blocking a new one: queued, or running on a
   * worker recently enough that it isn't assumed dead. */
  private findOutstandingRequest() {
    const orphanedBefore = new Date(Date.now() - ORPHANED_RUN_AFTER_HOURS * 60 * 60 * 1000);
    return this.prisma.ingestionRequest.findFirst({
      where: {
        OR: [
          { status: IngestionRequestStatus.QUEUED },
          { status: IngestionRequestStatus.RUNNING, claimedAt: { gte: orphanedBefore } },
        ],
      },
      orderBy: { requestedAt: "asc" },
      select: { status: true, claimedBy: true },
    });
  }

  /** The most recent pull requests, newest first, for the admin queue view. */
  async listPullRequests(): Promise<PullRequestSummary[]> {
    return this.prisma.ingestionRequest.findMany({
      orderBy: { requestedAt: "desc" },
      take: PULL_REQUEST_HISTORY_LIMIT,
      select: {
        id: true,
        status: true,
        season: true,
        fromDate: true,
        toDate: true,
        scheduled: true,
        requestedAt: true,
        claimedBy: true,
        claimedAt: true,
        finishedAt: true,
        message: true,
        requestedBy: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Cancels a request that no worker has claimed yet. Returns false when
   * there is nothing to cancel — unknown id, or already claimed: a running
   * pull is on another machine and can't be stopped from here.
   */
  async cancelPullRequest(requestId: string): Promise<boolean> {
    const { count } = await this.prisma.ingestionRequest.updateMany({
      where: { id: requestId, status: IngestionRequestStatus.QUEUED },
      data: {
        status: IngestionRequestStatus.CANCELLED,
        finishedAt: new Date(),
        message: "Cancelled by an admin before a worker picked it up.",
      },
    });
    return count === 1;
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
    // Runs on every deployment. Where this server can pull, a due pull runs
    // here; where it can't (the deployed API), it is queued for a pull
    // worker instead — queuePull refuses while one is already outstanding,
    // so an offline worker doesn't collect a backlog of hourly requests.
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

    if (!shouldRun) return;

    this.logger.log(`Scheduled ingestion: frequency=${schedule.frequency}, lastRun=${lastRun?.toISOString() ?? "never"}`);
    if (schedule.pullMode === "queue") {
      await this.queuePull({}, { requestedById: null, scheduled: true });
    } else {
      await this.triggerPull();
    }
  }
}
