import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { prisma } from "../../src/lib/prisma";
import { clearReportsCache } from "../../src/handlers/reports";
import { getTestApp } from "../helpers/app";
import { resetDb } from "../helpers/reset";
import { loginToken, seedClub, seedMembership, seedStaff } from "../helpers/seed";

const authGet = async (path: string, token?: string) => {
  const app = await getTestApp();
  const req = request(app).get(path);
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
};

describe("GET /api/v1/reports/summary (integration)", () => {
  let clubId: string;
  let adminToken: string;
  let staffToken: string;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-12T16:00:00Z"));
    clearReportsCache();
    await resetDb();
    const club = await seedClub({ maxCapacity: 10 });
    clubId = club.id;
    const admin = await seedStaff({
      clubId,
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
      pin: "1234"
    });
    const staff = await seedStaff({
      clubId,
      name: "Staff",
      email: "staff@example.com",
      role: "STAFF",
      pin: "2026"
    });

    adminToken = loginToken(admin);
    staffToken = loginToken(staff);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const seedReportData = async () => {
    const first = await seedMembership({
      clubId,
      tier: "Family4",
      persons: [
        { firstName: "Kelly", lastName: "Oldis", email: "kelly@example.com" },
        { firstName: "Tyler", lastName: "Oldis" }
      ]
    });
    const second = await seedMembership({
      clubId,
      tier: "Family5",
      persons: [{ firstName: "Joseph", lastName: "Walters", email: "joseph@example.com" }]
    });

    await prisma.membership.updateMany({
      where: { id: { in: [first.membership.id, second.membership.id] } },
      data: { submittedAt: new Date("2026-05-01T12:00:00Z") }
    });

    await prisma.checkinEvent.createMany({
      data: [
        {
          clubId,
          personId: first.persons[0]!.id,
          membershipId: first.membership.id,
          staffId: null,
          checkedInAt: new Date("2026-06-02T14:00:00Z"),
          signedOutAt: new Date("2026-06-02T16:00:00Z"),
          isActive: false,
          numGuests: 2,
          source: "test_seed"
        },
        {
          clubId,
          personId: first.persons[1]!.id,
          membershipId: first.membership.id,
          staffId: null,
          checkedInAt: new Date("2026-06-02T15:00:00Z"),
          signedOutAt: new Date("2026-06-02T17:00:00Z"),
          isActive: false,
          numGuests: 0,
          source: "test_seed"
        },
        {
          clubId,
          personId: first.persons[0]!.id,
          membershipId: first.membership.id,
          staffId: null,
          checkedInAt: new Date("2026-06-03T17:00:00Z"),
          signedOutAt: new Date("2026-06-03T18:00:00Z"),
          isActive: false,
          numGuests: 0,
          source: "test_seed"
        }
      ]
    });

    await prisma.guestPassPurchase.create({
      data: {
        clubId,
        membershipId: first.membership.id,
        personId: first.persons[0]!.id,
        code: "test-purchase",
        quantityPurchased: 3,
        purchasedAt: new Date("2026-06-04T15:00:00Z")
      }
    });

    await prisma.memberEditLog.create({
      data: {
        clubId,
        staffId: (await prisma.staff.findFirstOrThrow({ where: { clubId, role: "STAFF" } })).id,
        targetType: "person",
        personId: first.persons[0]!.id,
        membershipId: first.membership.id,
        targetLabel: "Kelly Oldis",
        changes: { age: { from: null, to: "40" } },
        createdAt: new Date("2026-06-05T15:00:00Z")
      }
    });

    return { first, second };
  };

  it("returns season summary numbers for admins", async () => {
    const { second } = await seedReportData();

    const response = await authGet("/api/v1/reports/summary?range=season", adminToken);

    expect(response.status).toBe(200);
    expect(response.body.range).toBe("season");
    expect(response.body.kpis.totalVisits.value).toBe(5);
    expect(response.body.kpis.uniqueMembers.value).toBe(2);
    expect(response.body.kpis.totalVisits.delta).toBeNull();
    expect(response.body.kpis.openDays).toBe(2);
    expect(response.body.kpis.avgPerOpenDay.value).toBe(2.5);
    expect(response.body.kpis.avgDailyAttendance).toBeUndefined();
    // dailyVisits enrichment: June 2, 2026 = Tuesday (weekday 2), peak 2 of 10 = 20%
    expect(response.body.dailyVisits.find((day: { date: string }) => day.date === "2026-06-02")).toMatchObject({
      members: 2,
      guests: 2,
      weekday: 2,
      peakMembers: 2,
      peakPct: 20
    });
    // June 3, 2026 = Wednesday (weekday 3), peak 1 of 10 = 10%
    expect(response.body.dailyVisits.find((day: { date: string }) => day.date === "2026-06-03")).toMatchObject({
      members: 1,
      guests: 0,
      weekday: 3,
      peakMembers: 1,
      peakPct: 10
    });
    expect(response.body.engagement.buckets).toEqual({ never: 1, casual: 1, regular: 0 });
    expect(response.body.engagement.neverVisited[0]).toMatchObject({
      householdName: "Joseph Walters",
      primaryPersonId: second.persons[0]!.id,
      email: "joseph@example.com"
    });
    expect(response.body.guestPasses).toMatchObject({
      revenueCents: 15000,
      packsSold: 3,
      passesSold: 30,
      guestsAdmitted: 2
    });
    // buyers: unsliced export source with per-household guest usage
    expect(response.body.guestPasses.buyers).toHaveLength(1);
    expect(response.body.guestPasses.buyers[0]).toMatchObject({
      householdName: "Kelly Oldis",
      email: "kelly@example.com",
      packs: 3,
      passes: 30,
      guestsAdmitted: 2
    });
    expect(response.body.capacity.maxCapacity).toBe(10);
    expect(response.body.staffActivity).toEqual([
      expect.objectContaining({
        name: "Staff",
        manualCheckins: 0,
        manualSignouts: 0,
        edits: 1
      })
    ]);
  });

  it("requires admin auth", async () => {
    await seedReportData();

    const staffResponse = await authGet("/api/v1/reports/summary?range=season", staffToken);
    expect(staffResponse.status).toBe(403);

    const noTokenResponse = await authGet("/api/v1/reports/summary?range=season");
    expect(noTokenResponse.status).toBe(401);
  });

  it("rejects invalid ranges", async () => {
    const response = await authGet("/api/v1/reports/summary?range=year", adminToken);
    expect(response.status).toBe(400);
  });

  it("caches summaries until the report cache is cleared", async () => {
    await seedReportData();

    const first = await authGet("/api/v1/reports/summary?range=season", adminToken);
    const second = await authGet("/api/v1/reports/summary?range=season", adminToken);
    expect(second.body.generatedAt).toBe(first.body.generatedAt);

    clearReportsCache();
    vi.setSystemTime(new Date("2026-06-12T16:00:01Z"));

    const third = await authGet("/api/v1/reports/summary?range=season", adminToken);
    expect(third.body.generatedAt).not.toBe(first.body.generatedAt);
  });
});
