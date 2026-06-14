import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import request from "supertest";
import { prisma } from "../../src/lib/prisma";
import { getTestApp } from "../helpers/app";
import { resetDb } from "../helpers/reset";
import { loginToken, seedClub, seedStaff } from "../helpers/seed";

describe("Admin staff CRUD (integration)", () => {
  let clubId: string;
  let adminId: string;
  let adminToken: string;
  let staffToken: string;
  let createdStaffIds: string[] = [];

  const api = async () => getTestApp();

  beforeEach(async () => {
    await resetDb();
    createdStaffIds = [];
    const club = await seedClub();
    clubId = club.id;
    const admin = await seedStaff({ clubId, name: "Admin", email: "admin@example.com", pin: "1234", role: "ADMIN" });
    const staff = await seedStaff({ clubId, name: "Front Desk", email: "desk@example.com", pin: "2026", role: "STAFF" });
    createdStaffIds.push(admin.id, staff.id);
    adminId = admin.id;
    adminToken = loginToken(admin);
    staffToken = loginToken(staff);
  });

  afterEach(async () => {
    if (createdStaffIds.length > 0) {
      await prisma.staff.deleteMany({ where: { id: { in: createdStaffIds } } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists club staff for admins and rejects STAFF tokens", async () => {
    const app = await api();
    const response = await request(app).get("/api/v1/admin/staff").set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.staff).toHaveLength(2);
    expect(response.body.staff.map((member: { email: string }) => member.email).sort()).toEqual([
      "admin@example.com",
      "desk@example.com"
    ]);

    const forbidden = await request(app).get("/api/v1/admin/staff").set("Authorization", `Bearer ${staffToken}`);
    expect(forbidden.status).toBe(403);
  });

  it("creates staff with a bcrypt-hashed PIN", async () => {
    const app = await api();
    const response = await request(app)
      .post("/api/v1/admin/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Lifeguard", email: "guard@example.com", pin: "5678", role: "STAFF" });

    expect(response.status).toBe(201);
    expect(response.body.staff).toMatchObject({ name: "Lifeguard", role: "STAFF", isActive: true });

    const created = await prisma.staff.findUniqueOrThrow({ where: { email: "guard@example.com" } });
    createdStaffIds.push(created.id);
    expect(created.passwordHash).not.toBe("5678"); // never plaintext
    expect(await bcrypt.compare("5678", created.passwordHash)).toBe(true);
  });

  it("rejects a duplicate PIN with 409 PIN_TAKEN", async () => {
    const app = await api();
    const response = await request(app)
      .post("/api/v1/admin/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Copycat", email: "copy@example.com", pin: "2026", role: "STAFF" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PIN_TAKEN");
    expect(await prisma.staff.count()).toBe(2);
  });

  it("rotates a staff PIN", async () => {
    const desk = await prisma.staff.findUniqueOrThrow({ where: { email: "desk@example.com" } });

    const app = await api();
    const response = await request(app)
      .patch(`/api/v1/admin/staff/${desk.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ pin: "4321" });

    expect(response.status).toBe(200);

    const updated = await prisma.staff.findUniqueOrThrow({ where: { id: desk.id } });
    expect(await bcrypt.compare("4321", updated.passwordHash)).toBe(true);
    expect(await bcrypt.compare("2026", updated.passwordHash)).toBe(false);
  });

  it("deactivates staff (soft delete)", async () => {
    const desk = await prisma.staff.findUniqueOrThrow({ where: { email: "desk@example.com" } });

    const app = await api();
    const response = await request(app)
      .delete(`/api/v1/admin/staff/${desk.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(204);

    const deactivated = await prisma.staff.findUniqueOrThrow({ where: { id: desk.id } });
    expect(deactivated.isActive).toBe(false);
  });

  it("blocks demoting the last active admin with 409 LAST_ADMIN", async () => {
    const app = await api();
    const response = await request(app)
      .patch(`/api/v1/admin/staff/${adminId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "STAFF" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("LAST_ADMIN");

    const stillAdmin = await prisma.staff.findUniqueOrThrow({ where: { id: adminId } });
    expect(stillAdmin.role).toBe("ADMIN");
  });

  it("blocks deactivating the last active admin with 409 LAST_ADMIN", async () => {
    const app = await api();
    const response = await request(app)
      .delete(`/api/v1/admin/staff/${adminId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("LAST_ADMIN");

    const stillActive = await prisma.staff.findUniqueOrThrow({ where: { id: adminId } });
    expect(stillActive.isActive).toBe(true);
  });
});
