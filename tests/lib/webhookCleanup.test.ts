import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  webhookEvent: { deleteMany: vi.fn() }
}));

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
}));

const cronScheduleMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../../src/lib/logger", () => ({ logger: loggerMock }));
vi.mock("node-cron", () => ({ default: { schedule: cronScheduleMock } }));

import {
  cleanupProcessedWebhookEvents,
  runWebhookCleanupJob,
  startWebhookCleanupJob
} from "../../src/lib/webhookCleanup";

describe("cleanupProcessedWebhookEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes only PROCESSED rows older than 90 days", async () => {
    prismaMock.webhookEvent.deleteMany.mockResolvedValue({ count: 7 });

    const count = await cleanupProcessedWebhookEvents();

    expect(count).toBe(7);
    const args = prismaMock.webhookEvent.deleteMany.mock.calls[0]?.[0] as {
      where: { status: string; receivedAt: { lt: Date } };
    };
    expect(args.where.status).toBe("PROCESSED");
    const expectedCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    expect(Math.abs(args.where.receivedAt.lt.getTime() - expectedCutoff)).toBeLessThan(5000);
    expect(loggerMock.info).toHaveBeenCalledWith("Webhook cleanup completed", {
      deleted: 7,
      retentionDays: 90
    });
  });
});

describe("runWebhookCleanupJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("catches and logs errors instead of throwing", async () => {
    prismaMock.webhookEvent.deleteMany.mockRejectedValue(new Error("database unavailable"));

    await expect(runWebhookCleanupJob()).resolves.toBeUndefined();
    expect(loggerMock.error).toHaveBeenCalledWith("Webhook cleanup failed", { message: "database unavailable" });
  });
});

describe("startWebhookCleanupJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DISABLE_WEBHOOK_CLEANUP;
  });

  it("schedules the nightly job at 3 AM New York time", () => {
    startWebhookCleanupJob();

    expect(cronScheduleMock).toHaveBeenCalledWith("0 3 * * *", expect.any(Function), {
      timezone: "America/New_York"
    });
  });

  it("skips scheduling when DISABLE_WEBHOOK_CLEANUP=true", () => {
    process.env.DISABLE_WEBHOOK_CLEANUP = "true";

    startWebhookCleanupJob();

    expect(cronScheduleMock).not.toHaveBeenCalled();
    expect(loggerMock.info).toHaveBeenCalledWith("Webhook cleanup scheduling disabled");
    delete process.env.DISABLE_WEBHOOK_CLEANUP;
  });
});
