import { describe, expect, it } from "vitest";
import { mapCanonicalMembership } from "../../src/ingestion/load";
import type { CanonicalMembership } from "../../src/ingestion/types";

const membership = (overrides: Partial<CanonicalMembership> = {}): CanonicalMembership => ({
  accountHolderName: "Caleb Lewis",
  email: "caleb@example.com",
  phone: "+13025550100",
  memberCount: 2,
  paymentAmount: 240,
  guestPasses: 5,
  medicalNotes: "Asthma",
  persons: [
    { fullName: "Caleb Lewis", isPrimary: true, phone: "+13025550100", age: 40 },
    { fullName: "Ethan Lewis", isPrimary: false, age: 11 }
  ],
  ...overrides
});

describe("mapCanonicalMembership", () => {
  it("maps tier and capacity while omitting sensitive household fields", () => {
    const plan = mapCanonicalMembership("club-1", membership());

    expect(plan.membership).toMatchObject({
      clubId: "club-1",
      tier: "Adult",
      maxMembers: 2,
      paymentAmountCents: 0,
      guestPassesTotal: 5,
      source: "demo_import",
      status: "ACTIVE"
    });
    expect(plan.membership).toMatchObject({
      addressStreet: null,
      addressCity: null,
      addressState: null,
      addressPostalCode: null,
      addressCountry: null,
      submittedAt: null,
      externalOrderId: null
    });
  });

  it("falls back to member-count tier parsing when payment does not map", () => {
    const plan = mapCanonicalMembership(
      "club-1",
      membership({ paymentAmount: undefined, memberCount: 3 })
    );

    expect(plan.membership.tier).toBe("Family3");
    expect(plan.membership.maxMembers).toBe(3);
    expect(plan.membership.paymentAmountCents).toBe(0);
  });

  it("maps people without retaining contact or medical details", () => {
    const plan = mapCanonicalMembership("club-1", membership());

    expect(plan.persons).toEqual([
      expect.objectContaining({
        firstName: "Caleb",
        lastName: "Lewis",
        isPrimary: true,
        relationship: "self",
        email: null,
        phone: null,
        allergies: null
      }),
      expect.objectContaining({
        firstName: "Ethan",
        lastName: "Lewis",
        isPrimary: false,
        relationship: "member",
        email: null,
        phone: null,
        allergies: null
      })
    ]);
  });

  it("maps absent household contact fields to null persistence values", () => {
    const plan = mapCanonicalMembership("club-1", membership({ email: undefined, phone: undefined }));

    expect(plan.persons[0]).toMatchObject({ email: null, phone: null });
  });
});
