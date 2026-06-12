import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import type { StaffResponse } from "../middleware/jwtAuth";

const paramsSchema = z.object({
  id: z.string().min(1)
});

const membershipParamsSchema = z.object({
  membershipId: z.string().min(1)
});

export const addPersonSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(""),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  phone: z.string().optional(),
  age: z.number().int().min(0).max(120).optional(),
  relationship: z.string().trim().min(1).max(40).default("family_member")
});

export const cleanPhone = (raw: string | undefined): string | null | undefined => {
  if (raw === undefined) {
    return undefined;
  }

  if (raw.trim() === "") {
    return null;
  }

  const digits = raw.replace(/\D/g, "").slice(-10);
  return digits.length > 0 ? digits : null;
};

export const updatePersonSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  phone: z.string().optional(),
  age: z.union([z.number().int().min(0).max(120), z.literal(null)]).optional(),
  relationship: z.string().trim().min(1).max(40).optional(),
  allergies: z.string().max(500).optional()
});

export const updateAddressSchema = z.object({
  addressStreet: z.string().trim().max(200).optional(),
  addressCity: z.string().trim().max(80).optional(),
  addressState: z.string().trim().max(80).optional(),
  addressPostalCode: z.string().trim().max(20).optional(),
  addressCountry: z.string().trim().max(80).optional()
});

export const updateEmergencySchema = z.object({
  emergencyContactName: z.string().trim().max(120).optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactEmail: z.union([z.string().trim().email(), z.literal("")]).optional()
});

export type FieldChanges = Record<string, { from: string | null; to: string | null }>;

const normalizeChangeValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
};

export const computeFieldChanges = (
  before: Record<string, unknown>,
  after: Record<string, unknown>
): FieldChanges => {
  const changes: FieldChanges = {};

  for (const [field, nextValue] of Object.entries(after)) {
    if (nextValue === undefined) {
      continue;
    }

    const from = normalizeChangeValue(before[field]);
    const to = normalizeChangeValue(nextValue);

    if (from !== to) {
      changes[field] = { from, to };
    }
  }

  return changes;
};

const fullName = (person: { firstName: string; lastName: string }): string =>
  `${person.firstName} ${person.lastName}`.trim();

const householdLabel = (persons: Array<{ firstName: string; lastName: string; isPrimary: boolean }>): string => {
  const primary = persons.find((person) => person.isPrimary) ?? persons[0];
  const lastName = primary?.lastName?.trim();

  return lastName ? `${lastName} household` : "Household";
};

const hasChanges = (changes: FieldChanges): boolean => Object.keys(changes).length > 0;

export const updatePerson: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const staffId = staffResponse.locals.staff.id;
    const { id } = paramsSchema.parse(req.params);
    const input = updatePersonSchema.parse(req.body);
    const existing = await prisma.person.findFirst({
      where: { id, clubId },
      select: {
        id: true,
        membershipId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        age: true,
        relationship: true,
        allergies: true
      }
    });

    if (!existing) {
      throw new HttpError(404, "PERSON_NOT_FOUND", "Member was not found");
    }

    const data: Record<string, unknown> = {};

    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.email !== undefined) data.email = input.email === "" ? null : input.email;
    if (input.phone !== undefined) data.phone = cleanPhone(input.phone);
    if (input.age !== undefined) data.age = input.age;
    if (input.relationship !== undefined) data.relationship = input.relationship;
    if (input.allergies !== undefined) data.allergies = input.allergies;

    const changes = computeFieldChanges(existing, data);

    if (!hasChanges(changes)) {
      const { membershipId: _membershipId, ...person } = existing;
      res.json({ person });
      return;
    }

    const targetLabel = fullName({
      firstName: (data.firstName as string | undefined) ?? existing.firstName,
      lastName: (data.lastName as string | undefined) ?? existing.lastName
    });
    const updated = await prisma.$transaction(async (tx) => {
      const person = await tx.person.update({
        where: { id },
        data,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          age: true,
          relationship: true,
          allergies: true
        }
      });

      await tx.memberEditLog.create({
        data: {
          clubId,
          staffId,
          targetType: "person",
          personId: id,
          membershipId: existing.membershipId,
          targetLabel,
          changes: changes as Prisma.InputJsonValue
        }
      });

      return person;
    });

    res.json({ person: updated });
  } catch (error) {
    next(error);
  }
};

export const updateMembershipAddress: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const staffId = staffResponse.locals.staff.id;
    const { id } = paramsSchema.parse(req.params);
    const input = updateAddressSchema.parse(req.body);
    const existing = await prisma.membership.findFirst({
      where: { id, clubId },
      select: {
        id: true,
        addressStreet: true,
        addressCity: true,
        addressState: true,
        addressPostalCode: true,
        addressCountry: true,
        persons: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: {
            firstName: true,
            lastName: true,
            isPrimary: true
          }
        }
      }
    });

    if (!existing) {
      throw new HttpError(404, "MEMBERSHIP_NOT_FOUND", "Membership was not found");
    }

    const data: Record<string, unknown> = {};

    if (input.addressStreet !== undefined) data.addressStreet = input.addressStreet || null;
    if (input.addressCity !== undefined) data.addressCity = input.addressCity || null;
    if (input.addressState !== undefined) data.addressState = input.addressState || null;
    if (input.addressPostalCode !== undefined) data.addressPostalCode = input.addressPostalCode || null;
    if (input.addressCountry !== undefined) data.addressCountry = input.addressCountry || null;

    const changes = computeFieldChanges(existing, data);

    if (!hasChanges(changes)) {
      const { persons: _persons, ...membership } = existing;
      res.json({ membership });
      return;
    }

    const targetLabel = householdLabel(existing.persons);
    const updated = await prisma.$transaction(async (tx) => {
      const membership = await tx.membership.update({
        where: { id },
        data,
        select: {
          id: true,
          addressStreet: true,
          addressCity: true,
          addressState: true,
          addressPostalCode: true,
          addressCountry: true
        }
      });

      await tx.memberEditLog.create({
        data: {
          clubId,
          staffId,
          targetType: "membership_address",
          membershipId: id,
          targetLabel,
          changes: changes as Prisma.InputJsonValue
        }
      });

      return membership;
    });

    res.json({ membership: updated });
  } catch (error) {
    next(error);
  }
};

export const updateMembershipEmergency: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const staffId = staffResponse.locals.staff.id;
    const { id } = paramsSchema.parse(req.params);
    const input = updateEmergencySchema.parse(req.body);
    const membership = await prisma.membership.findFirst({
      where: { id, clubId },
      select: {
        id: true,
        persons: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: {
            firstName: true,
            lastName: true,
            isPrimary: true,
            emergencyContactName: true,
            emergencyContactPhone: true,
            emergencyContactEmail: true
          }
        }
      }
    });

    if (!membership) {
      throw new HttpError(404, "MEMBERSHIP_NOT_FOUND", "Membership was not found");
    }

    const data: Record<string, unknown> = {};

    if (input.emergencyContactName !== undefined) data.emergencyContactName = input.emergencyContactName || null;
    if (input.emergencyContactPhone !== undefined) data.emergencyContactPhone = cleanPhone(input.emergencyContactPhone);
    if (input.emergencyContactEmail !== undefined) {
      data.emergencyContactEmail = input.emergencyContactEmail === "" ? null : input.emergencyContactEmail;
    }

    const representative = membership.persons[0] ?? {
      emergencyContactName: null,
      emergencyContactPhone: null,
      emergencyContactEmail: null
    };
    const changes = computeFieldChanges(representative, data);

    if (!hasChanges(changes)) {
      res.json({
        membershipId: id,
        updatedCount: 0,
        ...data
      });
      return;
    }

    const targetLabel = householdLabel(membership.persons);
    const result = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.person.updateMany({
        where: { membershipId: id, clubId },
        data
      });

      await tx.memberEditLog.create({
        data: {
          clubId,
          staffId,
          targetType: "membership_emergency",
          membershipId: id,
          targetLabel,
          changes: changes as Prisma.InputJsonValue
        }
      });

      return updateResult;
    });

    res.json({
      membershipId: id,
      updatedCount: result.count,
      ...data
    });
  } catch (error) {
    next(error);
  }
};

export const addPersonToMembership: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const staffId = staffResponse.locals.staff.id;
    const { membershipId } = membershipParamsSchema.parse(req.params);
    const input = addPersonSchema.parse(req.body);
    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, clubId },
      select: { id: true, maxMembers: true }
    });

    if (!membership) {
      throw new HttpError(404, "MEMBERSHIP_NOT_FOUND", "Membership was not found");
    }

    const targetLabel = fullName(input);
    const result = await prisma.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: {
          clubId,
          membershipId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email === "" || input.email === undefined ? null : input.email,
          phone: cleanPhone(input.phone) ?? null,
          age: input.age ?? null,
          relationship: input.relationship,
          isPrimary: false,
          status: "ACTIVE"
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          age: true,
          relationship: true
        }
      });

      const activeCount = await tx.person.count({
        where: { membershipId, clubId, status: "ACTIVE" }
      });

      // Adding beyond the paid member limit silently expands it (policy chosen
      // by the club): never block staff at the gate, but always leave an audit trail.
      const bumpedTo = activeCount > membership.maxMembers ? activeCount : null;

      if (bumpedTo !== null) {
        await tx.membership.update({
          where: { id: membershipId },
          data: { maxMembers: bumpedTo }
        });
      }

      await tx.memberEditLog.create({
        data: {
          clubId,
          staffId,
          targetType: "person_add",
          personId: person.id,
          membershipId,
          targetLabel,
          changes: {
            added: { from: null, to: targetLabel },
            ...(bumpedTo !== null
              ? { maxMembers: { from: String(membership.maxMembers), to: String(bumpedTo) } }
              : {})
          } as Prisma.InputJsonValue
        }
      });

      return { person, bumpedTo };
    });

    res.status(201).json({
      person: result.person,
      ...(result.bumpedTo !== null ? { maxMembersIncreasedTo: result.bumpedTo } : {})
    });
  } catch (error) {
    next(error);
  }
};

export const softDeletePerson: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const staffId = staffResponse.locals.staff.id;
    const { id } = paramsSchema.parse(req.params);
    const person = await prisma.person.findFirst({
      where: { id, clubId },
      select: {
        id: true,
        membershipId: true,
        firstName: true,
        lastName: true,
        isPrimary: true,
        status: true
      }
    });

    if (!person) {
      throw new HttpError(404, "PERSON_NOT_FOUND", "Member was not found");
    }

    if (person.isPrimary) {
      throw new HttpError(409, "CANNOT_DELETE_PRIMARY", "The primary account holder cannot be removed");
    }

    const activeCheckin = await prisma.checkinEvent.findFirst({
      where: { personId: id, isActive: true },
      select: { id: true }
    });

    if (activeCheckin) {
      throw new HttpError(409, "PERSON_CHECKED_IN", "Sign them out before removing them");
    }

    await prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id },
        data: { status: "INACTIVE" }
      });

      await tx.memberEditLog.create({
        data: {
          clubId,
          staffId,
          targetType: "person_remove",
          personId: id,
          membershipId: person.membershipId,
          targetLabel: fullName(person),
          changes: { status: { from: person.status, to: "INACTIVE" } } as Prisma.InputJsonValue
        }
      });
    });

    res.json({ personId: id, status: "INACTIVE" });
  } catch (error) {
    next(error);
  }
};

export const restorePerson: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const staffId = staffResponse.locals.staff.id;
    const { id } = paramsSchema.parse(req.params);
    const person = await prisma.person.findFirst({
      where: { id, clubId },
      select: {
        id: true,
        membershipId: true,
        firstName: true,
        lastName: true,
        status: true
      }
    });

    if (!person) {
      throw new HttpError(404, "PERSON_NOT_FOUND", "Member was not found");
    }

    if (person.status !== "INACTIVE") {
      throw new HttpError(409, "PERSON_NOT_INACTIVE", "Only hidden members can be restored");
    }

    await prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id },
        data: { status: "ACTIVE" }
      });

      await tx.memberEditLog.create({
        data: {
          clubId,
          staffId,
          targetType: "person_restore",
          personId: id,
          membershipId: person.membershipId,
          targetLabel: fullName(person),
          changes: { status: { from: "INACTIVE", to: "ACTIVE" } } as Prisma.InputJsonValue
        }
      });
    });

    res.json({ personId: id, status: "ACTIVE" });
  } catch (error) {
    next(error);
  }
};
