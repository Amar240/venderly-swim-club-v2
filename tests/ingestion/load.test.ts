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
  it("maps payment dollars, tier, capacity, and household fields", () => {
    const plan = mapCanonicalMembership("club-1", membership());

    expect(plan.membership).toMatchObject({
      clubId: "club-1",
      tier: "Adult",
      maxMembers: 2,
      paymentAmountCents: 24000,
      guestPassesTotal: 5,
      source: "demo_import",
      status: "ACTIVE"
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

  it("maps primary and additional people with the correct contact ownership", () => {
    const plan = mapCanonicalMembership("club-1", membership());

    expect(plan.persons).toEqual([
      expect.objectContaining({
        firstName: "Caleb",
        lastName: "Lewis",
        isPrimary: true,
        relationship: "self",
        email: "caleb@example.com",
        allergies: "Asthma"
      }),
      expect.objectContaining({
        firstName: "Ethan",
        lastName: "Lewis",
        isPrimary: false,
        relationship: "member",
        email: null,
        allergies: null
      })
    ]);
  });
});
