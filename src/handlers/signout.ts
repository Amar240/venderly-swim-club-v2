import type { RequestHandler } from "express";
import { z } from "zod";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";

const toStr = (value: unknown): string => {
  if (Array.isArray(value)) {
    return String(value[0] ?? "");
  }

  return String(value ?? "");
};

const signOutWebhookSchema = z
  .object({
    location: z
      .object({
        id: z.string().min(1)
      })
      .passthrough()
      .optional(),
    location_id: z.string().min(1).optional(),
    contact_id: z.string().optional(),
    first_name: z.unknown().optional().default("").transform(toStr),
    last_name: z.unknown().optional().default("").transform(toStr),
    email: z.unknown().transform(toStr).pipe(z.string().email()),
    phone: z.unknown().optional().default("").transform(toStr),
    "Membership Name": z.string().optional(),
    "I want to sign-out all of the people in my membership": z.unknown().optional().default("").transform(toStr)
  })
  .catchall(z.unknown());

type SignOutWebhookPayload = z.infer<typeof signOutWebhookSchema>;

type MembershipPerson = {
  id: string;
  firstName: string;
  lastName: string;
};

type FoundPerson = {
  id: string;
  firstName: string;
  lastName: string;
  membershipId: string;
  membership: {
    id: string;
    persons: MembershipPerson[];
  };
};

const cleanPhoneNumber = (phone: string | undefined): string | undefined => {
  if (!phone) {
    return undefined;
  }

  const digits = phone.replace(/\D/g, "");
  const normalized = digits.slice(-10);
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeName = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

const fullName = (person: { firstName: string; lastName: string }): string => `${person.firstName} ${person.lastName}`.trim();

const findPersonByEmail = async (clubId: string, input: SignOutWebhookPayload): Promise<FoundPerson | null> => {
  const emailMatch = await prisma.person.findFirst({
    where: {
      clubId,
      email: input.email,
      status: "ACTIVE",
      membership: { status: "ACTIVE" }
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      membershipId: true,
      membership: {
        select: {
          id: true,
          persons: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
          }
        }
      }
    }
  });

  if (!emailMatch) {
    return null;
  }

  if (!input.first_name) {
    return emailMatch;
  }

  const matchingMembershipPerson = emailMatch.membership.persons.find(
    (person) => normalizeName(person.firstName) === normalizeName(input.first_name)
  );

  if (!matchingMembershipPerson || matchingMembershipPerson.id === emailMatch.id) {
    return emailMatch;
  }

  const matchingPerson = await prisma.person.findFirst({
    where: {
      id: matchingMembershipPerson.id,
      clubId,
      status: "ACTIVE",
      membership: { status: "ACTIVE" }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      membershipId: true,
      membership: {
        select: {
          id: true,
          persons: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
          }
        }
      }
    }
  });

  return matchingPerson ?? emailMatch;
};

const findHouseholdByEmailOrPhone = async (clubId: string, input: SignOutWebhookPayload): Promise<FoundPerson | null> => {
  const emailMatch = await findPersonByEmail(clubId, input);

  if (emailMatch) {
    return emailMatch;
  }

  const phone = cleanPhoneNumber(input.phone);

  if (!phone) {
    return null;
  }

  return prisma.person.findFirst({
    where: {
      clubId,
      phone,
      status: "ACTIVE",
      membership: { status: "ACTIVE" }
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      membershipId: true,
      membership: {
        select: {
          id: true,
          persons: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
          }
        }
      }
    }
  });
};

export const signOutHandler: RequestHandler = async (req, res, next) => {
  try {
    const expectedSecret = process.env.WEBHOOK_SECRET;
    const providedSecret = req.header("X-Webhook-Secret");

    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
      res.status(401).json({ valid: false, message: "Invalid webhook secret" });
      return;
    }

    const input = signOutWebhookSchema.parse(req.body);
    const locationId = input.location?.id ?? input.location_id;
    const signOutAll =
      String(input["I want to sign-out all of the people in my membership"] ?? "")
        .trim()
        .toLowerCase() === "yes";

    if (!locationId) {
      res.status(422).json({ valid: false, message: "Club not found" });
      return;
    }

    const club = await prisma.club.findFirst({
      where: {
        ghlLocationId: locationId,
        isActive: true
      },
      select: { id: true }
    });

    if (!club) {
      res.status(422).json({ valid: false, message: "Club not found" });
      return;
    }

    if (signOutAll) {
      const household = await findHouseholdByEmailOrPhone(club.id, input);

      if (!household) {
        res.status(200).json({
          valid: false,
          code: "NOT_FOUND",
          message: "Member not found. Please see staff."
        });
        return;
      }

      const activeCheckins = await prisma.checkinEvent.findMany({
        where: {
          clubId: club.id,
          membershipId: household.membershipId,
          isActive: true
        },
        select: {
          id: true,
          person: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (activeCheckins.length === 0) {
        res.status(200).json({
          valid: true,
          message: "No one from your membership is currently checked in.",
          signedOut: []
        });
        return;
      }

      await prisma.$transaction(async (transaction) => {
        await transaction.checkinEvent.updateMany({
          where: {
            id: {
              in: activeCheckins.map((checkin) => checkin.id)
            }
          },
          data: {
            isActive: false,
            signedOutAt: new Date()
          }
        });
      });

      const signedOut = activeCheckins.map((checkin) => fullName(checkin.person));
      const count = signedOut.length;

      res.status(200).json({
        valid: true,
        message: `Signed out ${count} ${count === 1 ? "person" : "people"}`,
        signedOut
      });
      return;
    }

    const person = await findPersonByEmail(club.id, input);

    if (!person) {
      res.status(200).json({
        valid: false,
        code: "NOT_FOUND",
        message: "Member not found. Please see staff."
      });
      return;
    }

    const activeCheckin = await prisma.checkinEvent.findFirst({
      where: {
        clubId: club.id,
        personId: person.id,
        isActive: true
      },
      select: { id: true }
    });

    if (!activeCheckin) {
      res.status(200).json({
        valid: false,
        code: "NOT_FOUND",
        message: "Not currently checked in"
      });
      return;
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.checkinEvent.update({
        where: { id: activeCheckin.id },
        data: {
          isActive: false,
          signedOutAt: new Date()
        }
      });
    });

    res.status(200).json({
      valid: true,
      message: `Goodbye ${person.firstName}!`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sign-out webhook error";
    logger.error("Sign-out webhook failed", { message });
    next(error);
  }
};
