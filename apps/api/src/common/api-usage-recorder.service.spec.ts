import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiUsageRecorder,
  MAX_PENDING_USAGE_ROWS,
  USAGE_FLUSH_INTERVAL_IN_MILLISECONDS,
} from "./api-usage-recorder.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";

const CALL_TIME = new Date("2026-10-09T10:00:00.000Z");

function createRecorder() {
  const createMany = vi.fn().mockResolvedValue({ count: 0 });
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const prisma = { apiUsageLog: { createMany }, apiKey: { updateMany } } as unknown as PrismaService;
  return { recorder: new ApiUsageRecorder(prisma), createMany, updateMany };
}

describe("ApiUsageRecorder", () => {
  let recorders: ApiUsageRecorder[] = [];

  function trackRecorder(created: ReturnType<typeof createRecorder>) {
    recorders.push(created.recorder);
    return created;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(CALL_TIME);
  });

  afterEach(async () => {
    await Promise.all(recorders.map((recorder) => recorder.onModuleDestroy()));
    recorders = [];
    vi.useRealTimers();
  });

  it("writes nothing per request: rows wait for the next flush", () => {
    const { recorder, createMany } = trackRecorder(createRecorder());

    recorder.recordUsage({ consumerId: "c1", keyId: "k1", endpoint: "GET /v1/players" });

    expect(createMany).not.toHaveBeenCalled();
  });

  it("flushes queued rows, with their real request time, on the timer", async () => {
    const { recorder, createMany } = trackRecorder(createRecorder());
    recorder.recordUsage({ consumerId: "c1", keyId: "k1", endpoint: "GET /v1/players" });

    await vi.advanceTimersByTimeAsync(USAGE_FLUSH_INTERVAL_IN_MILLISECONDS);

    expect(createMany).toHaveBeenCalledWith({
      data: [{ consumerId: "c1", endpoint: "GET /v1/players", statusCode: 200, calledAt: CALL_TIME }],
    });
  });

  it("stamps lastUsedAt once per key used since the last flush", async () => {
    const { recorder, updateMany } = trackRecorder(createRecorder());
    recorder.recordUsage({ consumerId: "c1", keyId: "k1", endpoint: "GET /v1/players" });
    recorder.recordUsage({ consumerId: "c1", keyId: "k1", endpoint: "GET /v1/teams" });
    recorder.recordUsage({ consumerId: "c2", keyId: "k2", endpoint: "GET /v1/games" });

    await recorder.flushUsage();

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["k1", "k2"] } },
      data: { lastUsedAt: CALL_TIME },
    });
  });

  it("does nothing when no request came in since the last flush", async () => {
    const { recorder, createMany, updateMany } = trackRecorder(createRecorder());

    await recorder.flushUsage();

    expect(createMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("writes each row once, even across several flushes", async () => {
    const { recorder, createMany } = trackRecorder(createRecorder());
    recorder.recordUsage({ consumerId: "c1", keyId: "k1", endpoint: "GET /v1/players" });

    await recorder.flushUsage();
    await recorder.flushUsage();

    expect(createMany).toHaveBeenCalledTimes(1);
  });

  it("flushes early once a burst fills the buffer", () => {
    const { recorder, createMany } = trackRecorder(createRecorder());

    for (let index = 0; index < MAX_PENDING_USAGE_ROWS; index += 1) {
      recorder.recordUsage({ consumerId: "c1", keyId: "k1", endpoint: "GET /v1/players" });
    }

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data).toHaveLength(MAX_PENDING_USAGE_ROWS);
  });

  it("drops a batch the database refuses instead of throwing", async () => {
    const { recorder, createMany } = trackRecorder(createRecorder());
    createMany.mockRejectedValueOnce(new Error("connection reset"));
    recorder.recordUsage({ consumerId: "c1", keyId: "k1", endpoint: "GET /v1/players" });

    await expect(recorder.flushUsage()).resolves.toBeUndefined();
  });

  it("writes whatever is still queued when the app shuts down", async () => {
    const { recorder, createMany } = createRecorder();
    recorder.recordUsage({ consumerId: "c1", keyId: "k1", endpoint: "GET /v1/players" });

    await recorder.onModuleDestroy();

    expect(createMany).toHaveBeenCalledTimes(1);
  });
});
