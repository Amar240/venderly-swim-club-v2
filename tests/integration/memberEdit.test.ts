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
});
