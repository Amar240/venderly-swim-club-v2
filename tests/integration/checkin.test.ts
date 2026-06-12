import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/lib/prisma";
import { getTestApp } from "../helpers/app";
import { buildBatchCheckinPayload, buildSingleCheckinPayload, TEST_WEBHOOK_SECRET } from "../helpers/payloads";
import { resetDb } from "../helpers/reset";
import { seedClub, seedMembership } from "../helpers/seed";

const postCheckin = async (payload: Record<string, unknown>) => {
  const app = await getTestApp();
  return request(app).post("/webhooks/ghl/checkin").set("X-Webhook-Secret", TEST_WEBHOOK_SECRET).send(payload);
};

const HOUSEHOLD = [
  { firstName: "Donna", lastName: "Phillips", email: "donna.phillips@example.com", phone: "3025551234" },
  { firstName: "Tyler", lastName: "Phillips" },
  { firstName: "Emma", lastName: "Phillips" }
];

describe("POST /webhooks/ghl/checkin (integration)", () => {
  let clubId: string;

  beforeEach(async () => {
    await resetDb();
    const club = await seedClub();
    clubId = club.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("batch check-in", () => {
    it("checks in all named members and decrements guest passes (happy path)", async () => {
      const { membership } = await seedMembership({
        clubId,
        maxMembers: 4,
        guestPassesTotal: 5,
        persons: HOUSEHOLD
      });

      const response = await postCheckin(
        buildBatchCheckinPayload(["Donna Phillips", "Tyler Phillips", "Emma Phillips"], {
          "Any guests?": "Yes",
          "# of guests entering": "2"
        })
      );

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.checkedIn).toHaveLength(3);
      expect(response.body.numGuests).toBe(2);
      expect(response.body.guestPassesRemaining).toBe(3);

      const events = await prisma.checkinEvent.findMany({ orderBy: { checkedInAt: "asc" } });
      expect(events).toHaveLength(3);
      expect(events.every((event) => event.isActive)).toBe(true);
      // Guests are recorded on the first event only
      expect(events[0]?.numGuests).toBe(2);
      expect(events[1]?.numGuests).toBe(0);
      expect(events[2]?.numGuests).toBe(0);

      const updated = await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } });
      expect(updated.guestPassesUsed).toBe(2);
    });

    it("rejects the whole batch when any name is unmatched (all-or-nothing)", async () => {
      await seedMembership({ clubId, maxMembers: 4, persons: HOUSEHOLD });

      const response = await postCheckin(
        buildBatchCheckinPayload(["Donna Phillips", "Tyler Phillips", "Nobody Known"])
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ valid: false, code: "BATCH_NAME_UNMATCHED" });
      expect(response.body.message).toContain("Nobody Known");

      // No partial writes
      expect(await prisma.checkinEvent.count()).toBe(0);
    });

    it("rejects the whole batch when one member is already checked in", async () => {
      const { membership, persons } = await seedMembership({ clubId, maxMembers: 4, persons: HOUSEHOLD });
      const tyler = persons.find((person) => person.firstName === "Tyler");
      await prisma.checkinEvent.create({
        data: {
          clubId,
          personId: tyler!.id,
          membershipId: membership.id,
          eventType: "check_in",
          isActive: true,
          checkedInAt: new Date(),
          source: "test_seed"
        }
      });

      const response = await postCheckin(
        buildBatchCheckinPayload(["Donna Phillips", "Tyler Phillips"])
      );

      expect(response.body).toMatchObject({ valid: false, code: "ALREADY_CHECKED_IN" });
      // Only the pre-existing event remains
      expect(await prisma.checkinEvent.count()).toBe(1);
    });

    it("rejects the batch when it would exceed membership capacity", async () => {
      await seedMembership({ clubId, maxMembers: 2, persons: HOUSEHOLD });

      const response = await postCheckin(
        buildBatchCheckinPayload(["Donna Phillips", "Tyler Phillips", "Emma Phillips"])
      );

      expect(response.body).toMatchObject({ valid: false, code: "MEMBERSHIP_AT_CAPACITY" });
      expect(await prisma.checkinEvent.count()).toBe(0);
    });

    it('ignores "# of guests entering" unless "Any guests?" is Yes (form gate)', async () => {
      const { membership } = await seedMembership({
        clubId,
        maxMembers: 4,
        guestPassesTotal: 5,
        persons: HOUSEHOLD
      });

      const response = await postCheckin(
        buildBatchCheckinPayload(["Donna Phillips"], {
          "Any guests?": "No",
          "# of guests entering": "2"
        })
      );

      expect(response.body.valid).toBe(true);
      expect(response.body.numGuests).toBe(0);

      const unchanged = await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } });
      expect(unchanged.guestPassesUsed).toBe(0);
    });

    it("rejects the batch when guests exceed remaining guest passes, without consuming passes", async () => {
      const { membership } = await seedMembership({
        clubId,
        maxMembers: 4,
        guestPassesTotal: 1,
        persons: HOUSEHOLD
      });

      const response = await postCheckin(
        buildBatchCheckinPayload(["Donna Phillips"], {
          "Any guests?": "Yes",
          "# of guests entering": "2"
        })
      );

      expect(response.body).toMatchObject({ valid: false, code: "INSUFFICIENT_GUEST_PASSES" });
      expect(await prisma.checkinEvent.count()).toBe(0);

      const unchanged = await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } });
      expect(unchanged.guestPassesUsed).toBe(0);
    });
  });

  describe("legacy single-person check-in", () => {
    it("resolves the person by email and creates one active event", async () => {
      await seedMembership({ clubId, maxMembers: 4, persons: HOUSEHOLD });

      const response = await postCheckin(buildSingleCheckinPayload());

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);

      const events = await prisma.checkinEvent.findMany();
      expect(events).toHaveLength(1);
      expect(events[0]?.isActive).toBe(true);
    });

    it("returns ALREADY_CHECKED_IN on a duplicate check-in", async () => {
      await seedMembership({ clubId, maxMembers: 4, persons: HOUSEHOLD });

      const first = await postCheckin(buildSingleCheckinPayload());
      expect(first.body.valid).toBe(true);

      const second = await postCheckin(buildSingleCheckinPayload());
      expect(second.body).toMatchObject({ valid: false, code: "ALREADY_CHECKED_IN" });

      expect(await prisma.checkinEvent.count()).toBe(1);
    });

    /**
     * Race-condition regression test: parallel check-ins for the same person
     * must produce exactly one active checkin_event. If this fails, the
     * check-then-create in the handler is racy and needs a DB-level guard
     * (partial unique index on checkin_events(person_id) WHERE is_active).
     */
    it("creates exactly one active event when the same person checks in concurrently", async () => {
      await seedMembership({ clubId, maxMembers: 4, persons: HOUSEHOLD });

      const responses = await Promise.all(
        Array.from({ length: 4 }, () => postCheckin(buildSingleCheckinPayload()))
      );

      const succeeded = responses.filter((response) => response.body.valid === true);
      expect(succeeded.length).toBe(1);

      const activeEvents = await prisma.checkinEvent.count({
        where: { isActive: true }
      });
      expect(activeEvents).toBe(1);
    });
  });
});
