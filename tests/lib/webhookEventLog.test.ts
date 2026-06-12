import type { RequestHandler } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  club: {
    findFirst: vi.fn()
  },
  webhookEvent: {
    create: vi.fn(),
    updateMany: vi.fn()
  }
}));

vi.mock("../../src/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

import {
  buildWebhookPayloadPreview,
  getWebhookLocationId,
  replayWebhookEvent,
  trimErrorMessage
} from "../../src/lib/webhookEventLog";

describe("getWebhookLocationId", () => {
  it("reads nested and top-level GHL location ids", () => {
    expect(getWebhookLocationId({ location: { id: "loc_nested" } })).toBe("loc_nested");
    expect(getWebhookLocationId({ location_id: "loc_top" })).toBe("loc_top");
    expect(getWebhookLocationId({})).toBeUndefined();
  });
});

describe("buildWebhookPayloadPreview", () => {
  it("builds a defensive contact preview", () => {
    expect(
      buildWebhookPayloadPreview({
        first_name: "Kelly",
        last_name: "Oldis",
        email: "kelly@example.com",
        contact_id: "contact_1",
        location: { id: "loc_1" }
      })
    ).toBe("Name: Kelly Oldis · Email: kelly@example.com · Contact: contact_1 · Location: loc_1");
  });
});

describe("trimErrorMessage", () => {
  it("trims long error messages", () => {
    expect(trimErrorMessage(new Error("x".repeat(600)))).toHaveLength(500);
  });
});

describe("replayWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEBHOOK_SECRET = "test-secret";
    prismaMock.club.findFirst.mockResolvedValue({ id: "club_1" });
    prismaMock.webhookEvent.create.mockResolvedValue({ id: "event_replay" });
    prismaMock.webhookEvent.updateMany.mockResolvedValue({ count: 1 });
  });

  it("creates a replay row and marks it processed on success", async () => {
    const handler: RequestHandler = (_req, res) => {
      res.status(200).json({ success: true });
    };

    const result = await replayWebhookEvent("signup", { location: { id: "loc_1" } }, handler, "event_failed");

    expect(result).toMatchObject({ eventId: "event_replay", status: "PROCESSED", statusCode: 200 });
    expect(prismaMock.webhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endpoint: "signup",
          replayOfId: "event_failed"
        })
      })
    );
    expect(prismaMock.webhookEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event_replay" },
        data: expect.objectContaining({ status: "PROCESSED" })
      })
    );
  });

  it("marks the replay row failed when the handler throws", async () => {
    const handler: RequestHandler = () => {
      throw new Error("handler broke");
    };

    const result = await replayWebhookEvent("signup", { location_id: "loc_1" }, handler, "event_failed");

    expect(result).toMatchObject({ eventId: "event_replay", status: "FAILED" });
    expect(prismaMock.webhookEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "handler broke"
        })
      })
    );
  });

  it("still runs the handler if creating the event row fails", async () => {
    let ran = false;
    prismaMock.webhookEvent.create.mockRejectedValue(new Error("database unavailable"));
    const handler: RequestHandler = (_req, res) => {
      ran = true;
      res.status(200).json({ success: true });
    };

    const result = await replayWebhookEvent("signup", {}, handler, "event_failed");

    expect(ran).toBe(true);
    expect(result).toMatchObject({ eventId: "", status: "PROCESSED" });
    expect(prismaMock.webhookEvent.updateMany).not.toHaveBeenCalled();
  });

  it("treats already-checked-in check-in replays as processed", async () => {
    const handler: RequestHandler = (_req, res) => {
      res.status(409).json({ valid: false, code: "ALREADY_CHECKED_IN" });
    };

    const result = await replayWebhookEvent("checkin", {}, handler, "event_failed");

    expect(result).toMatchObject({ status: "PROCESSED", statusCode: 409 });
  });
});
