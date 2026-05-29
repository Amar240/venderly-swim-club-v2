import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { calculateInitialGuestPasses } from "../lib/guestPasses";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";

const FAMILY_MEMBER_ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"] as const;

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
    payment: z
      .object({
        total_amount: z.union([z.number(), z.string()]).optional(),
        line_items: z
          .array(
            z.object({
              price: z.union([z.number(), z.string()]).optional()
            })
          )
          .optional()
      })
      .passthrough()
      .optional(),
    "Payment Amount": z.union([z.number(), z.string()]).optional(),
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
    address1: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().optional(),
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

const parsePaymentAmountDollars = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value).replace(/[$,]/g, "").trim());

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed >= 1000 ? parsed / 100 : parsed;
};

const parseMembershipTierFromPaymentAmount = (amountDollars: number | undefined): MembershipTier | undefined => {
  if (amountDollars === undefined) {
    return undefined;
  }

  const roundedAmount = Math.round(amountDollars);

  if (roundedAmount >= 730) {
    return { tier: "FamilyLarge", maxMembers: 8 };
  }

  if (roundedAmount >= 580) {
    return { tier: "FamilyPlus", maxMembers: 6 };
  }

  switch (roundedAmount) {
    case 165:
      return { tier: "Student", maxMembers: 1 };
    case 240:
      return { tier: "Adult", maxMembers: 1 };
    case 290:
      return { tier: "AdultPlusChild", maxMembers: 2 };
    case 340:
      return { tier: "Family3", maxMembers: 3 };
    case 390:
    case 430:
      return { tier: "Family4", maxMembers: 4 };
    case 480:
    case 530:
      return { tier: "Family5", maxMembers: 5 };
    default:
      return undefined;
  }
};

const getPaymentAmountDollars = (payload: SignupPayload): number | undefined => {
  const triggerData = payload.triggerData;
  const candidates = [
    payload["Payment Amount"],
    triggerData?.["Payment Amount"],
    triggerData?.payment_amount,
    triggerData?.paymentAmount,
    triggerData?.amount,
    triggerData?.total_amount,
    triggerData?.totalAmount,
    payload.payment?.total_amount,
    payload.payment?.line_items?.[0]?.price
  ];

  for (const candidate of candidates) {
    const amount = parsePaymentAmountDollars(candidate);

    if (amount !== undefined) {
      return amount;
    }
  }

  return undefined;
};

const resolveMembershipTier = (payload: SignupPayload): MembershipTier => {
  const parsedFromMemberCount = parseMembershipTier(payload["Select the # of Members for your Membership"]);

  if (parsedFromMemberCount.tier !== "unknown") {
    return parsedFromMemberCount;
  }

  return parseMembershipTierFromPaymentAmount(getPaymentAmountDollars(payload)) ?? parsedFromMemberCount;
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
    const membershipTier = resolveMembershipTier(input);
    const now = new Date();
    const endsAt = addOneYear(now);
    const emergencyContactName = getStringField(input, "Emergency Contact Full Name");
    const emergencyContactPhone = cleanPhoneNumber(getStringField(input, "Emergency Contact Mobile Number"));
    const emergencyContactEmail = getStringField(input, "Emergency Contact Email");
    const addressStreet = getStringField(input, "Street Address") ?? getStringField(input, "address1") ?? null;
    const addressCity = getStringField(input, "City") ?? getStringField(input, "city") ?? null;
    const addressState = getStringField(input, "State") ?? getStringField(input, "state") ?? null;
    const addressCountry = getStringField(input, "Country") ?? getStringField(input, "country") ?? null;
    const addressPostalCode = getStringField(input, "Postal Code") ?? getStringField(input, "postal_code") ?? null;
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
