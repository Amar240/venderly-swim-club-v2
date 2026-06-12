import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import type { StaffRole } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";

export const TEST_GHL_LOCATION_ID = "test-location-1";

type SeedPersonInput = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  ghlContactId?: string;
};

type SeedClubInput = {
  ghlLocationId?: string;
  maxCapacity?: number;
};

type SeedMembershipInput = {
  clubId: string;
  tier?: string;
  maxMembers?: number;
  status?: "ACTIVE" | "EXPIRED" | "SUSPENDED" | "PENDING";
  guestPassesTotal?: number;
  guestPassesUsed?: number;
  ghlContactId?: string;
  persons: SeedPersonInput[];
};

type SeedStaffInput = {
  clubId: string;
  name?: string;
  email?: string;
  pin?: string;
  role?: StaffRole;
  isActive?: boolean;
};

export const seedClub = async (input: SeedClubInput = {}) =>
  prisma.club.create({
    data: {
      name: "Test Club",
      slug: "test-club",
      ghlLocationId: input.ghlLocationId ?? TEST_GHL_LOCATION_ID,
      maxCapacity: input.maxCapacity ?? 100,
      isActive: true
    }
  });

/** Creates a membership plus its household persons; first person defaults to primary. */
export const seedMembership = async (input: SeedMembershipInput) => {
  const membership = await prisma.membership.create({
    data: {
      clubId: input.clubId,
      tier: input.tier ?? "Family4",
      maxMembers: input.maxMembers ?? 4,
      status: (input.status ?? "ACTIVE") as never,
      guestPassesTotal: input.guestPassesTotal ?? 0,
      guestPassesUsed: input.guestPassesUsed ?? 0,
      ghlContactId: input.ghlContactId,
      source: "test_seed",
      submittedAt: new Date()
    }
  });

  const persons = [];

  for (const [index, person] of input.persons.entries()) {
    persons.push(
      await prisma.person.create({
        data: {
          clubId: input.clubId,
          membershipId: membership.id,
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          phone: person.phone,
          isPrimary: person.isPrimary ?? index === 0,
          ghlContactId: person.ghlContactId,
          relationship: index === 0 ? "self" : "family_member"
        }
      })
    );
  }

  return { membership, persons };
};

export const seedStaff = async (input: SeedStaffInput) => {
  const passwordHash = await bcrypt.hash(input.pin ?? "1234", 4);

  return prisma.staff.create({
    data: {
      clubId: input.clubId,
      name: input.name ?? "Test Staff",
      email: input.email ?? `staff-${randomUUID()}@example.com`,
      passwordHash,
      role: input.role ?? "STAFF",
      isActive: input.isActive ?? true
    }
  });
};

export const loginToken = (staff: {
  id: string;
  clubId: string;
  email: string;
  role: StaffRole;
}): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET must be set for integration tests");
  }

  return jwt.sign(
    {
      sub: staff.id,
      clubId: staff.clubId,
      email: staff.email,
      role: staff.role
    },
    secret,
    { expiresIn: "1h" }
  );
};

export const countRows = async () => {
  const [memberships, persons, checkinEvents, webhookEvents, memberEditLogs] = await Promise.all([
    prisma.membership.count(),
    prisma.person.count(),
    prisma.checkinEvent.count(),
    prisma.webhookEvent.count(),
    prisma.memberEditLog.count()
  ]);

  return { memberships, persons, checkinEvents, webhookEvents, memberEditLogs };
};
