import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { signOutAllActive } from "../../src/lib/autoSignout";
import { resetDb } from "../helpers/reset";
import { seedClub, seedMembership } from "../helpers/seed";

describe("signOutAllActive (integration, real DB)", () => {
  let clubId: string;
  let personId: string;
  let membershipId: string;

  beforeEach(async () => {
    await resetDb();
    const club = await seedClub();
    clubId = club.id;
    const { membership, persons } = await seedMembership({
      clubId,
      persons: [
        { firstName: "Donna", lastName: "Phillips" },
        { firstName: "Tyler", lastName: "Phillips" }
      ]
    });
    membershipId = membership.id;
    personId = persons[0]!.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("flips every active event regardless of check-in day and stamps signedOutAt", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const priorSignout = new Date(Date.now() - 12 * 60 * 60 * 1000);

    await prisma.checkinEvent.createMany({
      data: [
        // stale: forgot to sign out yesterday
        {
          clubId,
          personId,
          membershipId,
          eventType: "check_in",
          isActive: true,
          checkedInAt: yesterday,
          source: "test_seed"
        },
        // active today (second person)
        {
          clubId,
          personId: (await prisma.person.findFirstOrThrow({ where: { firstName: "Tyler" } })).id,
          membershipId,
          eventType: "check_in",
          isActive: true,
          checkedInAt: new Date(),
          source: "test_seed"
        },
        // already signed out: must remain untouched
        {
          clubId,
          personId,
          membershipId,
          eventType: "check_in",
          isActive: false,
          checkedInAt: yesterday,
          signedOutAt: priorSignout,
          source: "test_seed"
        }
      ]
    });

    const count = await signOutAllActive();

    expect(count).toBe(2);
    expect(await prisma.checkinEvent.count({ where: { isActive: true } })).toBe(0);

    const flipped = await prisma.checkinEvent.findMany({ where: { signedOutAt: { not: null } } });
    expect(flipped).toHaveLength(3);

    // The previously signed-out event keeps its original timestamp
    const untouched = await prisma.checkinEvent.findFirstOrThrow({
      where: { checkedInAt: yesterday, isActive: false, signedOutAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } }
    });
    expect(untouched.signedOutAt?.getTime()).toBe(priorSignout.getTime());
  });

  it("returns 0 when nothing is active", async () => {
    expect(await signOutAllActive()).toBe(0);
  });
});
