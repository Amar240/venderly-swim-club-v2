import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/lib/prisma";
import { getTestApp } from "../helpers/app";
import { TEST_WEBHOOK_SECRET } from "../helpers/payloads";
import { resetDb } from "../helpers/reset";
import { seedClub, seedMembership, TEST_GHL_LOCATION_ID } from "../helpers/seed";
import { waitFor } from "../helpers/waitFor";

const GP_CONTACT_ID = "contact_gp_1";

const buildGuestPassPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  location: { id: TEST_GHL_LOCATION_ID },
  contact_id: GP_CONTACT_ID,
  order_id: "order-1",
  quantity: 3,
  ...overrides
});

const postGuestPass = async (payload: Record<string, unknown>, secret: string = TEST_WEBHOOK_SECRET) => {
  const app = await getTestApp();
  return request(app).post("/webhooks/ghl/guestpass").set("X-Webhook-Secret", secret).send(payload);
};

describe("POST /webhooks/ghl/guestpass (integration)", () => {
  let membershipId: string;

  beforeEach(async () => {
    await resetDb();
    const club = await seedClub();
    const { membership } = await seedMembership({
      clubId: club.id,
      guestPassesTotal: 5,
      ghlContactId: GP_CONTACT_ID,
      persons: [{ firstName: "Kelly", lastName: "Oldis", email: "kelly@example.com" }]
    });
    membershipId = membership.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("credits passes from an explicit quantity and order_id", async () => {
    const response = await postGuestPass(buildGuestPassPayload());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      passesAdded: 30, // 3 packs x 10 passes
      newGuestPassesTotal: 35 // 5 free + 30 purchased
    });

    const membership = await prisma.membership.findUniqueOrThrow({ where: { id: membershipId } });
    expect(membership.guestPassesTotal).toBe(35);

    const purchase = await prisma.guestPassPurchase.findFirstOrThrow();
    expect(purchase.quantityPurchased).toBe(3);
    expect(purchase.code).toBe("order-1");
  });

  it("is idempotent: re-firing the same order_id does not double-credit", async () => {
    const first = await postGuestPass(buildGuestPassPayload());
    expect(first.body.success).toBe(true);

    const second = await postGuestPass(buildGuestPassPayload());
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ success: true, duplicate: true });

    const membership = await prisma.membership.findUniqueOrThrow({ where: { id: membershipId } });
    expect(membership.guestPassesTotal).toBe(35); // credited exactly once

    expect(await prisma.guestPassPurchase.count()).toBe(1);
  });

  it("derives the pack quantity from the payment amount when quantity is missing", async () => {
    const response = await postGuestPass(
      buildGuestPassPayload({ quantity: undefined, order_id: "order-amount", amount: 150 })
    );

    expect(response.body).toMatchObject({
      success: true,
      passesAdded: 30 // $150 / $50 per pack = 3 packs
    });
  });

  it("rejects when neither quantity nor amount is usable, without writing", async () => {
    const response = await postGuestPass(
      buildGuestPassPayload({ quantity: undefined, amount: undefined, order_id: "order-empty" })
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ valid: false, code: "QUANTITY_REQUIRED" });

    expect(await prisma.guestPassPurchase.count()).toBe(0);
    const membership = await prisma.membership.findUniqueOrThrow({ where: { id: membershipId } });
    expect(membership.guestPassesTotal).toBe(5); // unchanged
  });

  it("rejects an unknown contact without writing", async () => {
    const response = await postGuestPass(buildGuestPassPayload({ contact_id: "contact_unknown" }));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ valid: false, code: "MEMBERSHIP_NOT_FOUND" });
    expect(await prisma.guestPassPurchase.count()).toBe(0);
  });

  it("caps a single purchase at 50 packs", async () => {
    const response = await postGuestPass(buildGuestPassPayload({ quantity: 80, order_id: "order-big" }));

    expect(response.body).toMatchObject({ success: true, passesAdded: 500 }); // 50 packs x 10

    const purchase = await prisma.guestPassPurchase.findFirstOrThrow();
    expect(purchase.quantityPurchased).toBe(50);
  });

  it("logs the webhook to webhook_events as PROCESSED", async () => {
    await postGuestPass(buildGuestPassPayload());

    await waitFor(async () => {
      const event = await prisma.webhookEvent.findFirstOrThrow();
      expect(event.endpoint).toBe("guestpass");
      expect(event.status).toBe("PROCESSED");
    });
  });
});
