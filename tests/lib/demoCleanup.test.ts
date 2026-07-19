import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prospect: { findMany: vi.fn(), deleteMany: vi.fn() },
  ingestionJob: { deleteMany: vi.fn() },
  club: { deleteMany: vi.fn() },
  $transaction: vi.fn()
}));
const loggerMock = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
const scheduleMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../../src/lib/logger", () => ({ logger: loggerMock }));
vi.mock("node-cron", () => ({ default: { schedule: scheduleMock } }));

import { cleanupExpiredDemos, runDemoCleanupJob, startDemoCleanupJob } from "../../src/lib/demoCleanup";

describe("cleanupExpiredDemos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes expired jobs, prospects, and demo clubs", async () => {
    prismaMock.prospect.findMany.mockResolvedValue([
      { id: "prospect-1", clubId: "club-1" },
      { id: "prospect-2", clubId: null }
    ]);
    prismaMock.$transaction.mockResolvedValue([]);

    await expect(cleanupExpiredDemos()).resolves.toBe(2);
    expect(prismaMock.ingestionJob.deleteMany).toHaveBeenCalledWith({ where: { clubId: { in: ["club-1"] } } });
    expect(prismaMock.prospect.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["prospect-1", "prospect-2"] } }
    });
    expect(prismaMock.club.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["club-1"] } } });
  });
});

describe("runDemoCleanupJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs errors instead of throwing from the scheduled job", async () => {
    prismaMock.prospect.findMany.mockRejectedValue(new Error("database unavailable"));

    await expect(runDemoCleanupJob()).resolves.toBeUndefined();
    expect(loggerMock.error).toHaveBeenCalledWith("Demo cleanup failed", { message: "database unavailable" });
  });
});

describe("startDemoCleanupJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DISABLE_DEMO_CLEANUP;
  });

  it("schedules cleanup in New York time", () => {
    startDemoCleanupJob();
    expect(scheduleMock).toHaveBeenCalledWith("30 3 * * *", expect.any(Function), {
      timezone: "America/New_York"
    });
  });
});
