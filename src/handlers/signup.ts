import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { calculateInitialGuestPasses } from "../lib/guestPasses";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";

const FAMILY_MEMBER_ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"] as const;

const signupSchema = z
  .object({
    location: z
      .object({
        id: z.string().min(1)
      })
      .passthrough(),
    contact_id: z.string().min(1),
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    triggerData: z.record(z.unknown()).optional(),
    "Mobile phone numbers for all people on membership:": z.string().optional(),
    "Email addresses for all people on membership:": z.string().optional(),
    "All names and family relationships": z.string().optional(),
    "Include name(s) & age(s) of your child/children:": z.string().optional(),
    "Emergency Contact Full Name": z.string().optional(),
    "Emergency Contact Mobile Number": z.string().optional(),
    "Emergency Contact Email": z.string().email().optional(),
    "Street Address": z.string().optional(),
    "City": z.string().optional(),
    "State": z.string().optional(),
    "Country": z.string().optional(),
    "Postal Code": z.string().optional(),
    "Do you require any special accommodations? If so, please describe:": z.string().optional(),
    "Select the # of Members for your Membership": z.string().optional()
  })
  .catchall(z.unknown());

type SignupPayload = z.infer<typeof signupSchema>;

type ParsedFamilyMember = {
  firstName: string;
  lastName: string;
  phone?: string;
  age?: number;
};

type MembershipTier = {
  tier: string;
  maxMembers: number;
};

const cleanPhoneNumber = (phone: string | undefined): string | undefined => {
  if (!phone) {
    return undefined;
  }

  const digits = phone.replace(/\D/g, "");
  const normalized = digits.slice(-10);
  return normalized.length > 0 ? normalized : undefined;
};

const parseAge = (age: unknown): number | undefined => {
  if (typeof age === "number" && Number.isInteger(age)) {
    return age;
  }

  if (typeof age !== "string") {
    return undefined;
  }

  const parsed = Number.parseInt(age.replace(/\D/g, ""), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const splitFullName = (fullName: string): { firstName: string; lastName: string } => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const [firstName = "", ...lastNameParts] = parts;

  return {
    firstName,
    lastName: lastNameParts.join(" ")
  };
};

const normalizeName = (fullName: string): string => fullName.trim().replace(/\s+/g, " ").toLowerCase();

const getStringField = (payload: SignupPayload, fieldName: string): string | undefined => {
  const value = payload[fieldName];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

const parseMembershipTier = (memberCount: string | undefined): MembershipTier => {
  switch (memberCount?.trim()) {
    case "1":
      return { tier: "Student/Adult", maxMembers: 1 };
    case "2":
      return { tier: "AdultPlusChild", maxMembers: 2 };
    case "3":
      return { tier: "Family3", maxMembers: 3 };
    case "4":
      return { tier: "Family4", maxMembers: 4 };
    case "5+":
      return { tier: "Family5", maxMembers: 5 };
    default:
      return { tier: "unknown", maxMembers: 5 };
  }
};

const parseFamilyMembers = (payload: SignupPayload, accountHolderFullName: string): ParsedFamilyMember[] => {
  const normalizedAccountHolderName = normalizeName(accountHolderFullName);

  return FAMILY_MEMBER_ORDINALS.flatMap((ordinal): ParsedFamilyMember[] => {
    const fullName = getStringField(payload, `${ordinal} Member Full Name`);

    if (!fullName || normalizeName(fullName) === normalizedAccountHolderName) {
      return [];
    }

    const { firstName, lastName } = splitFullName(fullName);

    if (!firstName) {
      return [];
    }

    return [
      {
        firstName,
        lastName,
        phone: cleanPhoneNumber(getStringField(payload, `${ordinal} Member Phone`)),
        age: parseAge(payload[`${ordinal} Member Age`])
      }
    ];
  });
};

const getPaymentStatus = (triggerData: Record<string, unknown> | undefined): string => {
  if (!triggerData) {
    return "paid";
  }

  const candidateKeys = ["payment_status", "paymentStatus", "status"];

  for (const key of candidateKeys) {
    const value = triggerData[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "paid";
};

const addOneYear = (date: Date): Date => {
  const nextYear = new Date(date);
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  return nextYear;
};

export const signupHandler: RequestHandler = async (req, res, next) => {
  try {
    const expectedSecret = process.env.WEBHOOK_SECRET;
    const providedSecret = req.header("X-Webhook-Secret");

    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
      throw new HttpError(401, "INVALID_WEBHOOK_SECRET", "Invalid webhook secret");
    }

    const input = signupSchema.parse(req.body);
    const club = await prisma.club.findFirst({
      where: {
        ghlLocationId: input.location.id,
        isActive: true
      },
      select: { id: true }
    });

    if (!club) {
      throw new HttpError(422, "CLUB_NOT_FOUND", "No active club matches the GHL location id");
    }

    const accountHolderFullName = `${input.first_name} ${input.last_name}`;
    const familyMembers = parseFamilyMembers(input, accountHolderFullName);
    const membershipTier = parseMembershipTier(input["Select the # of Members for your Membership"]);
    const now = new Date();
    const endsAt = addOneYear(now);
    const emergencyContactName = getStringField(input, "Emergency Contact Full Name");
    const emergencyContactPhone = cleanPhoneNumber(getStringField(input, "Emergency Contact Mobile Number"));
    const emergencyContactEmail = getStringField(input, "Emergency Contact Email");
    const addressStreet = getStringField(input, "Street Address") ?? null;
    const addressCity = getStringField(input, "City") ?? null;
    const addressState = getStringField(input, "State") ?? null;
    const addressCountry = getStringField(input, "Country") ?? null;
    const addressPostalCode = getStringField(input, "Postal Code") ?? null;
    const allergies = getStringField(input, "Do you require any special accommodations? If so, please describe:");
    const paymentData = input.triggerData as Prisma.InputJsonObject | undefined;
    const paymentStatus = getPaymentStatus(input.triggerData);
    const guestPassesTotal = calculateInitialGuestPasses(now);

    const result = await prisma.$transaction(async (transaction) => {
      const existingMembership = await transaction.membership.findFirst({
        where: {
          clubId: club.id,
          ghlContactId: input.contact_id
        },
        select: { id: true }
      });

      const membership = existingMembership
        ? await transaction.membership.update({
            where: { id: existingMembership.id },
            data: {
              tier: membershipTier.tier,
              maxMembers: membershipTier.maxMembers,
              paymentStatus,
              paymentData,
              ghlContactId: input.contact_id,
              source: "ghl_signup",
              submittedAt: now,
              startsAt: now,
              endsAt,
              guestPassesTotal,
              addressStreet,
              addressCity,
              addressState,
              addressCountry,
              addressPostalCode
            },
            select: { id: true }
          })
        : await transaction.membership.create({
            data: {
              clubId: club.id,
              tier: membershipTier.tier,
              maxMembers: membershipTier.maxMembers,
              paymentStatus,
              paymentData,
              ghlContactId: input.contact_id,
              source: "ghl_signup",
              submittedAt: now,
              startsAt: now,
              endsAt,
              guestPassesTotal,
              addressStreet,
              addressCity,
              addressState,
              addressCountry,
              addressPostalCode
            },
            select: { id: true }
          });

      const existingPrimaryPerson = await transaction.person.findUnique({
        where: {
          clubId_ghlContactId: {
            clubId: club.id,
            ghlContactId: input.contact_id
          }
        },
        select: { id: true }
      });

      await transaction.person.upsert({
        where: {
          clubId_ghlContactId: {
            clubId: club.id,
            ghlContactId: input.contact_id
          }
        },
        create: {
          clubId: club.id,
          membershipId: membership.id,
          firstName: input.first_name,
          lastName: input.last_name,
          email: input.email,
          phone: cleanPhoneNumber(input.phone),
          ghlContactId: input.contact_id,
          isPrimary: true,
          relationship: "self",
          emergencyContactName,
          emergencyContactPhone,
          emergencyContactEmail: emergencyContactEmail ?? null,
          allergies
        },
        update: {
          membershipId: membership.id,
          firstName: input.first_name,
          lastName: input.last_name,
          email: input.email,
          phone: cleanPhoneNumber(input.phone),
          isPrimary: true,
          relationship: "self",
          emergencyContactName,
          emergencyContactPhone,
          emergencyContactEmail: emergencyContactEmail ?? null,
          allergies
        }
      });

      let personsCreated = existingPrimaryPerson ? 0 : 1;

      for (const familyMember of familyMembers) {
        const existingFamilyPersons = await transaction.person.findMany({
          where: {
            clubId: club.id,
            membershipId: membership.id,
            isPrimary: false
          },
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        });
        const familyMemberNormalizedName = normalizeName(`${familyMember.firstName} ${familyMember.lastName}`);
        const existingPerson = existingFamilyPersons.find(
          (person) => normalizeName(`${person.firstName} ${person.lastName}`) === familyMemberNormalizedName
        );

        if (existingPerson) {
          await transaction.person.update({
            where: { id: existingPerson.id },
            data: {
              phone: familyMember.phone,
              age: familyMember.age,
              relationship: "family_member",
              emergencyContactName,
              emergencyContactPhone,
              emergencyContactEmail: emergencyContactEmail ?? null,
              allergies
            }
          });
          continue;
        }

        await transaction.person.create({
          data: {
            clubId: club.id,
            membershipId: membership.id,
            firstName: familyMember.firstName,
            lastName: familyMember.lastName,
            phone: familyMember.phone,
            age: familyMember.age,
            isPrimary: false,
            relationship: "family_member",
            emergencyContactName,
            emergencyContactPhone,
            emergencyContactEmail: emergencyContactEmail ?? null,
            allergies
          }
        });
        personsCreated += 1;
      }

      return {
        membershipId: membership.id,
        personsCreated
      };
    });

    res.status(200).json({
      success: true,
      message: "Member created",
      membershipId: result.membershipId,
      personsCreated: result.personsCreated
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown signup webhook error";
    logger.error("Signup webhook failed", { message });
    next(error);
  }
};
