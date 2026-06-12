import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/lib/prisma";
import { cleanupProcessedWebhookEvents } from "../../src/lib/webhookCleanup";
import { getTestApp } from "../helpers/app";
import { resetDb } from "../helpers/reset";
import { loginToken, seedClub, seedStaff } from "../helpers/seed";

const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

describe("admin webhooks list + retention (integration)", () => {
  let clubId: string;
  let adminToken: string;

  beforeEach(async () => {
    await resetDb();
    const club = await seedClub();
    clubId = club.id;
    const admin = await seedStaff({ clubId, name: "Admin", email: "admin@example.com", role: "ADMIN" });
    adminToken = loginToken(admin);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("list rows carry a member name and no payload or technical error fields", async () => {
    await prisma.webhookEvent.create({
      data: {
        clubId,
        endpoint: "signup",
        status: "FAILED",
        errorMessage: "TypeError: cannot read properties of undefined",
        rawPayload: { first_name: "Chris", last_name: "Dennis", email: "cdennis@example.com", phone: "+12025550000" }
      }
    });

    const app = await getTestApp();
    const response = await request(app)
      .get("/api/v1/admin/webhooks?status=FAILED")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0]).toMatchObject({
      endpoint: "signup",
      status: "FAILED",
      memberName: "Chris Dennis"
    });
    // Owner-facing list must not leak payloads or technical errors
    expect(response.body.events[0].rawPayload).toBeUndefined();
    expect(response.body.events[0].payloadPreview).toBeUndefined();
    expect(response.body.events[0].errorMessage).toBeUndefined();
  });

  it("the developer detail endpoint still returns the raw payload and error", async () => {
    const event = await prisma.webhookEvent.create({
      data: {
        clubId,
        endpoint: "checkin",
        status: "FAILED",
        errorMessage: "boom",
        rawPayload: { email: "kelly@example.com" }
      }
    });

    const app = await getTestApp();
    const response = await request(app)
      .get(`/api/v1/admin/webhooks/${event.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.event).toMatchObject({
      errorMessage: "boom",
      rawPayload: { email: "kelly@example.com" }
    });
  });

  it("retention sweep deletes only PROCESSED rows older than 90 days", async () => {
    await prisma.webhookEvent.createMany({
      data: [
        { clubId, endpoint: "signup", status: "PROCESSED", rawPayload: {}, receivedAt: daysAgo(120) },
        { clubId, endpoint: "checkin", status: "PROCESSED", rawPayload: {}, receivedAt: daysAgo(10) },
        { clubId, endpoint: "guestpass", status: "FAILED", rawPayload: {}, receivedAt: daysAgo(200) },
        { clubId, endpoint: "signout", status: "RECEIVED", rawPayload: {}, receivedAt: daysAgo(120) }
      ]
    });

    const deleted = await cleanupProcessedWebhookEvents();

    expect(deleted).toBe(1); // only the 120-day-old PROCESSED row

    const remaining = await prisma.webhookEvent.findMany({ select: { status: true, endpoint: true } });
    expect(remaining).toHaveLength(3);
    expect(remaining.map((row) => row.endpoint).sort()).toEqual(["checkin", "guestpass", "signout"]);
  });
});
