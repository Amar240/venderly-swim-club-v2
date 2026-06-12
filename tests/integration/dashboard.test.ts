import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { prisma } from "../../src/lib/prisma";
import { getTestApp } from "../helpers/app";
import { resetDb } from "../helpers/reset";
import { loginToken, seedClub, seedMembership, seedStaff } from "../helpers/seed";

describe("GET /api/v1/dashboard/recent (integration)", () => {
  let clubId: string;
  let staffToken: string;

  beforeEach(async () => {
    // Pin the clock to noon NY so "one hour ago" can never cross midnight.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-12T16:00:00Z"));
    await resetDb();
    const club = await seedClub();
    clubId = club.id;
    const staff = await seedStaff({ clubId, name: "Staff", email: "staff@example.com", role: "STAFF" });
    staffToken = loginToken(staff);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns only today's events, each carrying the check-in/sign-out pair", async () => {
    const { membership, persons } = await seedMembership({
      clubId,
      persons: [
        { firstName: "Donna", lastName: "Phillips" },
        { firstName: "Tyler", lastName: "Phillips" }
      ]
    });
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    await prisma.checkinEvent.createMany({
      data: [
        // stale: a completed visit from two days ago must NOT appear
        {
          clubId,
          personId: persons[1]!.id,
          membershipId: membership.id,
          eventType: "check_in",
          isActive: false,
          checkedInAt: twoDaysAgo,
          signedOutAt: twoDaysAgo,
          source: "test_seed"
        },
        // today: one completed visit
        {
          clubId,
          personId: persons[0]!.id,
          membershipId: membership.id,
          eventType: "check_in",
          isActive: false,
          checkedInAt: oneHourAgo,
          signedOutAt: thirtyMinAgo,
          source: "test_seed"
        }
      ]
    });

    const app = await getTestApp();
    const response = await request(app)
      .get("/api/v1/dashboard/recent?limit=10")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(response.status).toBe(200);
    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0]).toMatchObject({
      personName: "Donna Phillips",
      eventType: "sign_out",
      checkedInAt: oneHourAgo.toISOString(),
      signedOutAt: thirtyMinAgo.toISOString()
    });
  });
});
