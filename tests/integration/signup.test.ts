import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { prisma } from "../../src/lib/prisma";
import { getTestApp } from "../helpers/app";
import { buildSignupPayload, TEST_WEBHOOK_SECRET } from "../helpers/payloads";
import { resetDb } from "../helpers/reset";
import { countRows, seedClub } from "../helpers/seed";
import { waitFor } from "../helpers/waitFor";

const postSignup = async (payload: Record<string, unknown>, secret: string = TEST_WEBHOOK_SECRET) => {
  const app = await getTestApp();
  return request(app).post("/webhooks/ghl/signup").set("X-Webhook-Secret", secret).send(payload);
};

describe("POST /webhooks/ghl/signup (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedClub();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates one membership and all household persons from a full payload", async () => {
    const response = await postSignup(buildSignupPayload());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, personsCreated: 3 });

    const membership = await prisma.membership.findFirstOrThrow({
      include: { persons: { orderBy: { isPrimary: "desc" } } }
    });

    expect(membership.tier).toBe("Family3");
    expect(membership.maxMembers).toBe(3);
    expect(membership.paymentStatus).toBe("paid");
    expect(membership.ghlContactId).toBe("contact_test_1");
    // Address lives on the membership (household), not on persons
    expect(membership.addressStreet).toBe("236 East Flagstone Dr");
    expect(membership.addressCity).toBe("Newark");
    expect(membership.addressPostalCode).toBe("19702");

    expect(membership.persons).toHaveLength(3);

    const [primary, ...family] = membership.persons;
    expect(primary.isPrimary).toBe(true);
    expect(primary.firstName).toBe("Donna");
    expect(primary.email).toBe("donna.phillips@example.com");
    expect(primary.phone).toBe("3025551234"); // cleaned to 10 digits
    expect(primary.relationship).toBe("self");

    const tyler = family.find((person) => person.firstName === "Tyler");
    expect(tyler).toBeDefined();
    expect(tyler?.lastName).toBe("Phillips");
    expect(tyler?.age).toBe(8); // parsed from "8 years old"

    // Emergency contact propagated to every person
    for (const person of membership.persons) {
      expect(person.emergencyContactPhone).toBe("3023321052");
      expect(person.emergencyContactEmail).toBe("donna.emergency@example.com");
    }
  });

  it("grants 5 guest passes when submitted on/before May 1, 2026", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));

    const response = await postSignup(buildSignupPayload());

    expect(response.status).toBe(200);
    const membership = await prisma.membership.findFirstOrThrow();
    expect(membership.guestPassesTotal).toBe(5);
  });

  it("grants 0 guest passes when submitted after May 1, 2026", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-11T12:00:00Z"));

    const response = await postSignup(buildSignupPayload());

    expect(response.status).toBe(200);
    const membership = await prisma.membership.findFirstOrThrow();
    expect(membership.guestPassesTotal).toBe(0);
  });

  it("treats N/@ emergency contact email as missing", async () => {
    const response = await postSignup(buildSignupPayload({ "Emergency Contact Email": "N/@" }));

    expect(response.status).toBe(200);

    const persons = await prisma.person.findMany();
    expect(persons).toHaveLength(3);
    expect(persons.every((person) => person.emergencyContactEmail === null)).toBe(true);
  });

  it("trims and treats N/A emergency contact email as missing", async () => {
    const response = await postSignup(buildSignupPayload({ "Emergency Contact Email": "  N/A  " }));

    expect(response.status).toBe(200);

    const persons = await prisma.person.findMany();
    expect(persons).toHaveLength(3);
    expect(persons.every((person) => person.emergencyContactEmail === null)).toBe(true);
  });

  it("re-firing the same contact_id updates the membership instead of duplicating", async () => {
    const first = await postSignup(buildSignupPayload());
    expect(first.status).toBe(200);

    const second = await postSignup(
      buildSignupPayload({ "Select the # of Members for your Membership": "4" })
    );
    expect(second.status).toBe(200);
    expect(second.body.personsCreated).toBe(0); // everyone already exists

    const counts = await countRows();
    expect(counts.memberships).toBe(1);
    expect(counts.persons).toBe(3);

    const membership = await prisma.membership.findFirstOrThrow();
    expect(membership.tier).toBe("Family4"); // updated, not duplicated
  });

  it("rejects a wrong webhook secret with 401 and writes nothing", async () => {
    const response = await postSignup(buildSignupPayload(), "wrong-secret");

    expect(response.status).toBe(401);

    const counts = await countRows();
    expect(counts.memberships).toBe(0);
    expect(counts.persons).toBe(0);
    // Unauthenticated requests must not be logged to webhook_events either
    expect(counts.webhookEvents).toBe(0);
  });

  it("logs the webhook to webhook_events as PROCESSED on success", async () => {
    await postSignup(buildSignupPayload());

    // The PROCESSED status is written asynchronously after the response is sent
    await waitFor(async () => {
      const event = await prisma.webhookEvent.findFirstOrThrow();
      expect(event.endpoint).toBe("signup");
      expect(event.status).toBe("PROCESSED");
    });
  });
});
