import type { RequestHandler } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import type { StaffResponse } from "../middleware/jwtAuth";

const paramsSchema = z.object({
  id: z.string().min(1)
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

export const updatePerson: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { id } = paramsSchema.parse(req.params);
    const input = updatePersonSchema.parse(req.body);
    const existing = await prisma.person.findFirst({
      where: { id, clubId },
      select: { id: true }
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

    const updated = await prisma.person.update({
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

    res.json({ person: updated });
  } catch (error) {
    next(error);
  }
};

export const updateMembershipAddress: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { id } = paramsSchema.parse(req.params);
    const input = updateAddressSchema.parse(req.body);
    const existing = await prisma.membership.findFirst({
      where: { id, clubId },
      select: { id: true }
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

    const updated = await prisma.membership.update({
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

    res.json({ membership: updated });
  } catch (error) {
    next(error);
  }
};

export const updateMembershipEmergency: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { id } = paramsSchema.parse(req.params);
    const input = updateEmergencySchema.parse(req.body);
    const membership = await prisma.membership.findFirst({
      where: { id, clubId },
      select: { id: true }
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

    const result = await prisma.person.updateMany({
      where: { membershipId: id, clubId },
      data
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
