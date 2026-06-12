import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/lib/prisma";
import { getTestApp } from "../helpers/app";
import { resetDb } from "../helpers/reset";
import { loginToken, seedClub, seedMembership, seedStaff } from "../helpers/seed";

const authPatch = async (path: string, token: string, body: Record<string, unknown>) => {
  const app = await getTestApp();
  return request(app).patch(path).set("Authorization", `Bearer ${token}`).send(body);
};

const authGet = async (path: string, token: string) => {
  const app = await getTestApp();
  return request(app).get(path).set("Authorization", `Bearer ${token}`);
};

describe("member edit audit logging (integration)", () => {
  let clubId: string;
  let adminToken: string;
  let staffToken: string;

  beforeEach(async () => {
    await resetDb();
    const club = await seedClub();
    clubId = club.id;
    const admin = await seedStaff({
      clubId,
      name: "Admin",
      email: "admin@example.com",
      pin: "1234",
      role: "ADMIN"
    });
    const staff = await seedStaff({
      clubId,
      name: "Staff",
      email: "staff@example.com",
      pin: "2026",
      role: "STAFF"
    });

    adminToken = loginToken(admin);
    staffToken = loginToken(staff);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("logs a person edit with before and after changes", async () => {
    const { persons } = await seedMembership({
      clubId,
      persons: [{ firstName: "Joseph", lastName: "Walters", email: "joseph@example.com" }]
    });
    const person = persons[0]!;
    await prisma.person.update({ where: { id: person.id }, data: { age: 40 } });

    const response = await authPatch(`/api/v1/members/persons/${person.id}`, staffToken, { age: 41 });

    expect(response.status).toBe(200);
    expect(response.body.person.age).toBe(41);

    const logs = await prisma.memberEditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      clubId,
      staffId: expect.any(String),
      targetType: "person",
      personId: person.id,
      membershipId: person.membershipId,
      targetLabel: "Joseph Walters"
    });
    expect(logs[0]?.changes).toEqual({ age: { from: "40", to: "41" } });
  });

  it("does not update or log when submitted values are unchanged", async () => {
    const { persons } = await seedMembership({
      clubId,
      persons: [{ firstName: "Lisa", lastName: "Walters", email: "lisa@example.com" }]
    });
    const person = persons[0]!;

    const response = await authPatch(`/api/v1/members/persons/${person.id}`, staffToken, { firstName: "Lisa" });

    expect(response.status).toBe(200);
    expect(response.body.person.firstName).toBe("Lisa");
    expect(await prisma.memberEditLog.count()).toBe(0);
  });

  it("logs a membership address edit", async () => {
    const { membership } = await seedMembership({
      clubId,
      persons: [{ firstName: "Kelly", lastName: "Oldis", email: "kelly@example.com" }]
    });

    const response = await authPatch(`/api/v1/members/memberships/${membership.id}/address`, staffToken, {
      addressStreet: "1200 New Jersey Avenue"
    });

    expect(response.status).toBe(200);
    expect(response.body.membership.addressStreet).toBe("1200 New Jersey Avenue");

    const log = await prisma.memberEditLog.findFirstOrThrow();
    expect(log).toMatchObject({
      clubId,
      targetType: "membership_address",
      personId: null,
      membershipId: membership.id,
      targetLabel: "Oldis household"
    });
    expect(log.changes).toEqual({
      addressStreet: { from: null, to: "1200 New Jersey Avenue" }
    });
  });

  it("returns edit activity to admins and rejects staff", async () => {
    const { persons } = await seedMembership({
      clubId,
      persons: [{ firstName: "Tyler", lastName: "Oldis", email: "tyler@example.com" }]
    });
    const person = persons[0]!;

    await authPatch(`/api/v1/members/persons/${person.id}`, staffToken, { allergies: "Bee sting kit" });

    const adminResponse = await authGet("/api/v1/admin/edits", adminToken);
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.events).toHaveLength(1);
    expect(adminResponse.body.events[0]).toMatchObject({
      targetType: "person",
      targetLabel: "Tyler Oldis",
      staff: { name: "Staff" },
      changes: { allergies: { from: null, to: "Bee sting kit" } }
    });

    const staffResponse = await authGet("/api/v1/admin/edits", staffToken);
    expect(staffResponse.status).toBe(403);
  });

  describe("add person to membership", () => {
    it("creates an active non-primary person and logs person_add", async () => {
      const { membership } = await seedMembership({
        clubId,
        maxMembers: 4,
        persons: [{ firstName: "Kelly", lastName: "Oldis", email: "kelly@example.com" }]
      });

      const app = await getTestApp();
      const response = await request(app)
        .post(`/api/v1/members/memberships/${membership.id}/persons`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ firstName: "Tom", lastName: "Oldis", age: 12, relationship: "son" });

      expect(response.status).toBe(201);
      expect(response.body.person).toMatchObject({ firstName: "Tom", lastName: "Oldis", age: 12 });
      expect(response.body.maxMembersIncreasedTo).toBeUndefined();

      const created = await prisma.person.findFirstOrThrow({ where: { firstName: "Tom" } });
      expect(created.isPrimary).toBe(false);
      expect(created.status).toBe("ACTIVE");

      const log = await prisma.memberEditLog.findFirstOrThrow({ where: { targetType: "person_add" } });
      expect(log).toMatchObject({ targetLabel: "Tom Oldis", membershipId: membership.id });
    });

    it("auto-bumps maxMembers when the household outgrows it, with an audit trail", async () => {
      const { membership } = await seedMembership({
        clubId,
        maxMembers: 1,
        persons: [{ firstName: "Kelly", lastName: "Oldis", email: "kelly@example.com" }]
      });

      const app = await getTestApp();
      const response = await request(app)
        .post(`/api/v1/members/memberships/${membership.id}/persons`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ firstName: "Tom", lastName: "Oldis" });

      expect(response.status).toBe(201);
      expect(response.body.maxMembersIncreasedTo).toBe(2);

      const updated = await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } });
      expect(updated.maxMembers).toBe(2);

      const log = await prisma.memberEditLog.findFirstOrThrow({ where: { targetType: "person_add" } });
      expect(log.changes).toMatchObject({ maxMembers: { from: "1", to: "2" } });
    });

    it("404s for a membership outside the staff club", async () => {
      const app = await getTestApp();
      const response = await request(app)
        .post("/api/v1/members/memberships/00000000-0000-0000-0000-000000000000/persons")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ firstName: "Ghost" });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("MEMBERSHIP_NOT_FOUND");
    });
  });

  describe("soft delete and restore person", () => {
    const seedHousehold = async () =>
      seedMembership({
        clubId,
        persons: [
          { firstName: "Kelly", lastName: "Oldis", email: "kelly@example.com" },
          { firstName: "Tom", lastName: "Oldis" }
        ]
      });

    it("blocks deleting the primary account holder", async () => {
      const { persons } = await seedHousehold();
      const app = await getTestApp();

      const response = await request(app)
        .delete(`/api/v1/members/persons/${persons[0]!.id}`)
        .set("Authorization", `Bearer ${staffToken}`);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CANNOT_DELETE_PRIMARY");

      const primary = await prisma.person.findUniqueOrThrow({ where: { id: persons[0]!.id } });
      expect(primary.status).toBe("ACTIVE");
    });

    it("blocks deleting someone who is currently checked in", async () => {
      const { membership, persons } = await seedHousehold();
      await prisma.checkinEvent.create({
        data: {
          clubId,
          personId: persons[1]!.id,
          membershipId: membership.id,
          eventType: "check_in",
          isActive: true,
          checkedInAt: new Date(),
          source: "test_seed"
        }
      });

      const app = await getTestApp();
      const response = await request(app)
        .delete(`/api/v1/members/persons/${persons[1]!.id}`)
        .set("Authorization", `Bearer ${staffToken}`);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("PERSON_CHECKED_IN");
    });

    it("soft deletes a non-primary person, hides them, and logs person_remove", async () => {
      const { persons } = await seedHousehold();
      const app = await getTestApp();

      const response = await request(app)
        .delete(`/api/v1/members/persons/${persons[1]!.id}`)
        .set("Authorization", `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: "INACTIVE" });

      const deleted = await prisma.person.findUniqueOrThrow({ where: { id: persons[1]!.id } });
      expect(deleted.status).toBe("INACTIVE");

      const log = await prisma.memberEditLog.findFirstOrThrow({ where: { targetType: "person_remove" } });
      expect(log.changes).toMatchObject({ status: { from: "ACTIVE", to: "INACTIVE" } });

      // Hidden from the member detail family list, present in hiddenMembers
      const detail = await authGet(`/api/v1/members/${persons[0]!.id}`, staffToken);
      expect(detail.body.member.family).toHaveLength(1);
      expect(detail.body.member.hiddenMembers).toEqual([
        expect.objectContaining({ personId: persons[1]!.id, name: "Tom Oldis" })
      ]);

      // Hidden from member search
      const search = await authGet("/api/v1/members?q=Tom", staffToken);
      expect(search.body.members).toHaveLength(0);
    });

    it("restores a hidden person and logs person_restore", async () => {
      const { persons } = await seedHousehold();
      const app = await getTestApp();

      await request(app).delete(`/api/v1/members/persons/${persons[1]!.id}`).set("Authorization", `Bearer ${staffToken}`);

      const restore = await request(app)
        .patch(`/api/v1/members/persons/${persons[1]!.id}/restore`)
        .set("Authorization", `Bearer ${staffToken}`);

      expect(restore.status).toBe(200);
      expect(restore.body).toMatchObject({ status: "ACTIVE" });

      const restored = await prisma.person.findUniqueOrThrow({ where: { id: persons[1]!.id } });
      expect(restored.status).toBe("ACTIVE");

      const log = await prisma.memberEditLog.findFirstOrThrow({ where: { targetType: "person_restore" } });
      expect(log.targetLabel).toBe("Tom Oldis");

      // Restoring an already-active person is rejected
      const again = await request(app)
        .patch(`/api/v1/members/persons/${persons[1]!.id}/restore`)
        .set("Authorization", `Bearer ${staffToken}`);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("PERSON_NOT_INACTIVE");
    });
  });
});
