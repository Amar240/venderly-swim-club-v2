import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/lib/prisma";
import { getTestApp } from "../helpers/app";
import { resetDb } from "../helpers/reset";
import { seedClub, seedStaff } from "../helpers/seed";

// The login rate limiter keys by req.ip; trust proxy is enabled, so each test
// uses its own X-Forwarded-For address to stay isolated from the others.
const postLogin = async (pin: string, ip: string) => {
  const app = await getTestApp();
  return request(app).post("/api/v1/auth/login").set("X-Forwarded-For", ip).send({ pin });
};

describe("POST /api/v1/auth/login (integration)", () => {
  let clubId: string;
  let createdStaffIds: string[] = [];

  beforeEach(async () => {
    await resetDb();
    createdStaffIds = [];
    const club = await seedClub();
    clubId = club.id;
    const admin = await seedStaff({ clubId, name: "Admin", email: "admin@example.com", pin: "1234", role: "ADMIN" });
    const staff = await seedStaff({ clubId, name: "Front Desk", email: "desk@example.com", pin: "2026", role: "STAFF" });
    createdStaffIds.push(admin.id, staff.id);
  });

  afterEach(async () => {
    if (createdStaffIds.length > 0) {
      await prisma.staff.deleteMany({ where: { id: { in: createdStaffIds } } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns a working JWT for a correct PIN", async () => {
    const response = await postLogin("1234", "10.1.0.1");

    expect(response.status).toBe(200);
    expect(response.body.data.staff).toMatchObject({ role: "ADMIN", email: "admin@example.com", clubId });

    // The token must actually work against a protected endpoint
    const app = await getTestApp();
    const protectedResponse = await request(app)
      .get("/api/v1/members")
      .set("Authorization", `Bearer ${response.body.data.token}`);
    expect(protectedResponse.status).toBe(200);
  });

  it("rejects a wrong PIN with 401 INVALID_PIN", async () => {
    const response = await postLogin("0000", "10.1.0.2");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_PIN");
  });

  it("rate limits the 6th attempt from the same IP, even with the correct PIN", async () => {
    const ip = "10.1.0.3";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await postLogin("0000", ip);
      expect(failed.status).toBe(401);
    }

    const sixth = await postLogin("1234", ip);
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe("TOO_MANY_ATTEMPTS");

    // A different IP is unaffected
    const otherIp = await postLogin("1234", "10.1.0.4");
    expect(otherIp.status).toBe(200);
  });

  it("a successful login resets the failure counter", async () => {
    const ip = "10.1.0.5";

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await postLogin("0000", ip);
    }

    const success = await postLogin("1234", ip);
    expect(success.status).toBe(200);

    // Counter reset: another failure is a plain 401, not a lockout
    const afterReset = await postLogin("0000", ip);
    expect(afterReset.status).toBe(401);
    expect(afterReset.body.error.code).toBe("INVALID_PIN");
  });

  it("rejects an inactive staff member's PIN", async () => {
    const formerStaff = await seedStaff({
      clubId,
      name: "Former Staff",
      email: "former@example.com",
      pin: "9999",
      role: "STAFF",
      isActive: false
    });
    createdStaffIds.push(formerStaff.id);

    const response = await postLogin("9999", "10.1.0.6");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_PIN");
  });

  it("rejects a malformed PIN with a validation error", async () => {
    const response = await postLogin("abc", "10.1.0.7");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
