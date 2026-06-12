import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  checkinEvent: {
    updateMany: vi.fn()
  }
}));

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn()
}));

const cronMock = vi.hoisted(() => ({
  schedule: vi.fn()
}));

vi.mock("../../src/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../../src/lib/logger", () => ({ logger: loggerMock }));
vi.mock("node-cron", () => ({ default: cronMock }));

import { runAutoSignoutJob, signOutAllActive, startAutoSignoutJob } from "../../src/lib/autoSignout";

describe("signOutAllActive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DISABLE_AUTO_SIGNOUT;
  });

  it("flips active check-ins and returns the updated count", async () => {
    prismaMock.checkinEvent.updateMany.mockResolvedValue({ count: 7 });

    await expect(signOutAllActive()).resolves.toBe(7);

    expect(prismaMock.checkinEvent.updateMany).toHaveBeenCalledWith({
      where: { isActive: true },
      data: {
        isActive: false,
        signedOutAt: expect.any(Date)
      }
    });
    expect(loggerMock.info).toHaveBeenCalledWith("Auto sign-out completed", { count: 7 });
  });
});

describe("runAutoSignoutJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DISABLE_AUTO_SIGNOUT;
  });

  it("catches and logs errors without throwing", async () => {
    prismaMock.checkinEvent.updateMany.mockRejectedValue(new Error("database unavailable"));

    await expect(runAutoSignoutJob()).resolves.toBeUndefined();

    expect(loggerMock.error).toHaveBeenCalledWith("Auto sign-out failed", { message: "database unavailable" });
  });
});

describe("startAutoSignoutJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DISABLE_AUTO_SIGNOUT;
  });

  it("does not schedule when disabled", () => {
    process.env.DISABLE_AUTO_SIGNOUT = "true";

    startAutoSignoutJob();

    expect(cronMock.schedule).not.toHaveBeenCalled();
    expect(loggerMock.info).toHaveBeenCalledWith("Auto sign-out scheduling disabled");
  });

  it("schedules the nightly New York job", () => {
    startAutoSignoutJob();

    expect(cronMock.schedule).toHaveBeenCalledWith("59 23 * * *", expect.any(Function), {
      timezone: "America/New_York"
    });
  });
});
