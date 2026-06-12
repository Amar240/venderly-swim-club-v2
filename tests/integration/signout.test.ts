import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/lib/prisma";
import { getTestApp } from "../helpers/app";
import { TEST_WEBHOOK_SECRET } from "../helpers/payloads";
import { resetDb } from "../helpers/reset";
import { seedClub, seedMembership, TEST_GHL_LOCATION_ID } from "../helpers/seed";

const buildSignOutPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  location: { id: TEST_GHL_LOCATION_ID },
  email: "donna.phillips@example.com",
  first_name: "Donna",
  last_name: "Phillips",
  ...overrides
});

const SIGN_OUT_ALL_FIELD = "I want to sign-out all of the people in my membership";

const postSignOut = async (payload: Record<string, unknown>, secret: string = TEST_WEBHOOK_SECRET) => {
  const app = await getTestApp();
  return request(app).post("/webhooks/ghl/signout").set("X-Webhook-Secret", secret).send(payload);
};

describe("POST /webhooks/ghl/signout (integration)", () => {
  let clubId: string;
  let membershipAId: string;
  let membershipBId: string;
  let donnaId: string;
  let tylerId: string;
  let bobId: string;

  const checkInPerson = async (personId: string, membershipId: string) =>
    prisma.checkinEvent.create({
      data: {
        clubId,
        personId,
        membershipId,
        eventType: "check_in",
        isActive: true,
        checkedInAt: new Date(),
        source: "test_seed"
      }
    });

  beforeEach(async () => {
    await resetDb();
    const club = await seedClub();
    clubId = club.id;

    const householdA = await seedMembership({
      clubId,
      persons: [
        { firstName: "Donna", lastName: "Phillips", email: "donna.phillips@example.com" },
        { firstName: "Tyler", lastName: "Phillips" }
      ]
    });
    const householdB = await seedMembership({
      clubId,
      persons: [{ firstName: "Bob", lastName: "Larsen", email: "bob.larsen@example.com" }]
    });

    membershipAId = householdA.membership.id;
    membershipBId = householdB.membership.id;
    donnaId = householdA.persons[0]!.id;
    tylerId = householdA.persons[1]!.id;
    bobId = householdB.persons[0]!.id;

    await checkInPerson(donnaId, membershipAId);
    await checkInPerson(tylerId, membershipAId);
    await checkInPerson(bobId, membershipBId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("signs out a single person by email and leaves everyone else active", async () => {
    const response = await postSignOut(buildSignOutPayload());

    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(true);

    const donnaEvent = await prisma.checkinEvent.findFirstOrThrow({ where: { personId: donnaId } });
    expect(donnaEvent.isActive).toBe(false);
    expect(donnaEvent.signedOutAt).not.toBeNull();

    // Tyler (same household) and Bob (other household) untouched
    expect(await prisma.checkinEvent.count({ where: { isActive: true } })).toBe(2);
  });

  it("sign-out-all flips every active event for the membership", async () => {
    const response = await postSignOut(buildSignOutPayload({ [SIGN_OUT_ALL_FIELD]: "Yes" }));

    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(true);
    expect(response.body.signedOut).toHaveLength(2);

    const remainingA = await prisma.checkinEvent.count({
      where: { membershipId: membershipAId, isActive: true }
    });
    expect(remainingA).toBe(0);
  });

  it("sign-out-all does NOT touch other memberships (scoping)", async () => {
    await postSignOut(buildSignOutPayload({ [SIGN_OUT_ALL_FIELD]: "Yes" }));

    const bobEvent = await prisma.checkinEvent.findFirstOrThrow({ where: { personId: bobId } });
    expect(bobEvent.isActive).toBe(true);
    expect(bobEvent.signedOutAt).toBeNull();
    expect(await prisma.checkinEvent.count({ where: { membershipId: membershipBId, isActive: true } })).toBe(1);
  });

  it("returns valid:false when the person has no active check-in", async () => {
    // Donna signs out, then tries again
    await postSignOut(buildSignOutPayload());
    const second = await postSignOut(buildSignOutPayload());

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ valid: false, code: "NOT_FOUND" });
  });

  it("sign-out-all with nobody checked in returns valid:true and an empty list", async () => {
    await postSignOut(buildSignOutPayload({ [SIGN_OUT_ALL_FIELD]: "Yes" }));
    const second = await postSignOut(buildSignOutPayload({ [SIGN_OUT_ALL_FIELD]: "Yes" }));

    expect(second.body).toMatchObject({ valid: true, signedOut: [] });
  });

  it("rejects a wrong webhook secret with 401 and flips nothing", async () => {
    const response = await postSignOut(buildSignOutPayload({ [SIGN_OUT_ALL_FIELD]: "Yes" }), "wrong-secret");

    expect(response.status).toBe(401);
    expect(await prisma.checkinEvent.count({ where: { isActive: true } })).toBe(3);
  });
});
