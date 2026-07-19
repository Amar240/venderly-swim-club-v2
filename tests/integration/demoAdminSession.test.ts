import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { resetDb } from "../helpers/reset";
import { seedMembership, seedStaff } from "../helpers/seed";

const app = createApp("pilot");

const seedDemo = async (suffix: string, email = "owner@example.com") => {
  const club = await prisma.club.create({
    data: { name: `Demo ${suffix}`, slug: `demo-${suffix}`, isActive: true, maxCapacity: 100 }
  });
  const prospect = await prisma.prospect.create({
    data: {
      clubName: club.name,
      contactName: `Owner ${suffix}`,
      email,
      clubId: club.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });
  return { club, prospect };
};

const createSession = (clubId: string, prospectId: string) =>
  request(app).post(`/api/v1/demo/${clubId}/admin-session`).send({ prospectId });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("pilot demo admin sessions", () => {
  beforeEach(resetDb);

  it("creates one plus-addressed club admin and returns its PIN only once", async () => {
    const { club, prospect } = await seedDemo("one");
    const first = await createSession(club.id, prospect.id).expect(201);

    expect(first.body).toMatchObject({
      staffEmail: expect.stringMatching(/^owner\+demo-[a-f0-9]{12}@example\.com$/),
      tempPin: expect.stringMatching(/^\d{4}$/),
      alreadyCreated: false,
      staff: { clubId: club.id, role: "ADMIN", demoAdmin: true }
    });

    const second = await createSession(club.id, prospect.id).expect(200);
    expect(second.body).toMatchObject({
      staffEmail: first.body.staffEmail,
      tempPin: null,
      alreadyCreated: true
    });
    expect(await prisma.staff.count({ where: { clubId: club.id } })).toBe(1);

    const payload = jwt.verify(first.body.token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    expect(payload).toMatchObject({ clubId: club.id, role: "ADMIN", demoAdmin: true });
    expect(payload.exp! * 1000).toBeLessThanOrEqual(prospect.expiresAt.getTime());
  });

  it("creates separate staff rows for repeat prospect emails across clubs", async () => {
    const first = await seedDemo("first", "same@example.com");
    const second = await seedDemo("second", "same@example.com");
    const firstSession = await createSession(first.club.id, first.prospect.id).expect(201);
    const secondSession = await createSession(second.club.id, second.prospect.id).expect(201);

    expect(firstSession.body.staffEmail).not.toBe(secondSession.body.staffEmail);
    expect(await prisma.staff.count()).toBe(2);
    expect(await prisma.staff.count({ where: { clubId: first.club.id } })).toBe(1);
    expect(await prisma.staff.count({ where: { clubId: second.club.id } })).toBe(1);
  });

  it("rejects missing, mismatched, and expired prospect capabilities", async () => {
    const first = await seedDemo("first");
    const second = await seedDemo("second");

    await request(app).post(`/api/v1/demo/${first.club.id}/admin-session`).send({}).expect(400);
    await createSession(first.club.id, second.prospect.id).expect(404);
    await prisma.prospect.update({ where: { id: first.prospect.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await createSession(first.club.id, first.prospect.id).expect(404);
    expect(await prisma.staff.count()).toBe(0);
  });

  it("preserves demo restrictions and expiration through PIN login", async () => {
    const { club, prospect } = await seedDemo("login");
    const session = await createSession(club.id, prospect.id).expect(201);
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "198.51.100.45")
      .send({ pin: session.body.tempPin })
      .expect(200);

    expect(login.body.data.staff.demoAdmin).toBe(true);
    const payload = jwt.verify(login.body.data.token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    expect(payload).toMatchObject({ clubId: club.id, demoAdmin: true });
    expect(payload.exp! * 1000).toBeLessThanOrEqual(prospect.expiresAt.getTime());
  });
});

describe("pilot demo club isolation", () => {
  beforeEach(resetDb);

  it("blocks cross-club reads and mutations across the authenticated surface", async () => {
    const demoA = await seedDemo("a");
    const demoB = await seedDemo("b");
    const householdA = await seedMembership({
      clubId: demoA.club.id,
      persons: [{ firstName: "Alice", lastName: "Alpha" }]
    });
    const householdB = await seedMembership({
      clubId: demoB.club.id,
      guestPassesTotal: 10,
      persons: [
        { firstName: "Bob", lastName: "Beta" },
        { firstName: "Bea", lastName: "Beta", isPrimary: false }
      ]
    });
    const staffB = await seedStaff({ clubId: demoB.club.id, pin: "8765", role: "ADMIN" });
    await prisma.checkinEvent.create({
      data: {
        clubId: demoB.club.id,
        membershipId: householdB.membership.id,
        personId: householdB.persons[0]!.id,
        staffId: staffB.id,
        eventType: "check_in",
        source: "staff_manual",
        checkedInAt: new Date(),
        signedOutAt: new Date(),
        isActive: false
      }
    });
    await prisma.memberEditLog.create({
      data: {
        clubId: demoB.club.id,
        staffId: staffB.id,
        personId: householdB.persons[0]!.id,
        membershipId: householdB.membership.id,
        targetType: "person",
        targetLabel: "Bob Beta",
        changes: { age: { from: null, to: "44" } }
      }
    });
    const sessionA = await createSession(demoA.club.id, demoA.prospect.id).expect(201);
    const token = sessionA.body.token as string;
    const headers = auth(token);

    const members = await request(app).get("/api/v1/members").set(headers).expect(200);
    expect(members.body.members.map((person: { firstName: string }) => person.firstName)).toEqual(["Alice"]);
    const memberships = await request(app).get("/api/v1/memberships").set(headers).expect(200);
    expect(memberships.body.memberships).toHaveLength(1);
    expect(memberships.body.memberships[0].membershipId).toBe(householdA.membership.id);

    await request(app).get(`/api/v1/members/${householdB.persons[0]!.id}`).set(headers).expect(404);
    const emptySummary = await request(app).get("/api/v1/dashboard/summary").set(headers).expect(200);
    expect(emptySummary.body.visitedToday).toBe(0);
    await request(app).get("/api/v1/dashboard/active").set(headers).expect(200);
    await request(app).get("/api/v1/dashboard/recent").set(headers).expect(200);
    const search = await request(app).get("/api/v1/dashboard/search?q=Bob").set(headers).expect(200);
    expect(search.body.matches).toEqual([]);
    await request(app).get("/api/v1/reports/summary?range=season").set(headers).expect(200);
    expect((await request(app).get("/api/v1/admin/activity").set(headers).expect(200)).body.events).toEqual([]);
    expect((await request(app).get("/api/v1/admin/edits").set(headers).expect(200)).body.events).toEqual([]);

    await request(app).post("/api/v1/dashboard/checkin/manual").set(headers).send({ personId: householdB.persons[0]!.id }).expect(404);
    await request(app).post("/api/v1/dashboard/signout/manual").set(headers).send({ membershipId: householdB.membership.id, scope: "membership" }).expect(404);
    await request(app).patch(`/api/v1/members/persons/${householdB.persons[0]!.id}`).set(headers).send({ age: 44 }).expect(404);
    await request(app).patch(`/api/v1/members/memberships/${householdB.membership.id}/address`).set(headers).send({ addressCity: "Elsewhere" }).expect(404);
    await request(app).patch(`/api/v1/members/memberships/${householdB.membership.id}/emergency`).set(headers).send({ emergencyContactName: "Other" }).expect(404);
    await request(app).post(`/api/v1/members/memberships/${householdB.membership.id}/persons`).set(headers).send({ firstName: "New", lastName: "Person", relationship: "member" }).expect(404);
    await request(app).post(`/api/v1/members/memberships/${householdB.membership.id}/passes/adjust`).set(headers).send({ quantity: 1, reason: "comp" }).expect(404);

    const untouched = await prisma.membership.findUniqueOrThrow({ where: { id: householdB.membership.id } });
    expect(untouched.guestPassesTotal).toBe(10);
    expect(await prisma.person.count({ where: { membershipId: householdB.membership.id } })).toBe(2);
    expect(await prisma.checkinEvent.count({ where: { clubId: demoB.club.id } })).toBe(1);

    await request(app).post("/api/v1/dashboard/checkin/manual").set(headers).send({ personId: householdA.persons[0]!.id }).expect(200);
    const summary = await request(app).get("/api/v1/dashboard/summary").set(headers).expect(200);
    expect(summary.body.currentlyInPoolMembers).toBe(1);
  });

  it("blocks demo-only configuration and destructive actions", async () => {
    const demo = await seedDemo("restricted");
    const household = await seedMembership({
      clubId: demo.club.id,
      persons: [{ firstName: "Primary", lastName: "Member" }, { firstName: "Child", lastName: "Member" }]
    });
    const session = await createSession(demo.club.id, demo.prospect.id).expect(201);
    const headers = auth(session.body.token);

    for (const response of [
      await request(app).get("/api/v1/admin/staff").set(headers),
      await request(app).post("/api/v1/admin/staff").set(headers).send({}),
      await request(app).post("/api/v1/dashboard/capacity").set(headers).send({ capacity: 50 }),
      await request(app).delete(`/api/v1/members/persons/${household.persons[1]!.id}`).set(headers)
    ]) {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("DEMO_FEATURE_UNAVAILABLE");
    }

    await request(app).get("/api/v1/admin/webhooks").set(headers).expect(404);
    await request(app).post("/webhooks/ghl/checkin").send({}).expect(404);
    await request(app).get("/welcome").expect(404);
  });
});

afterAll(() => prisma.$disconnect());
