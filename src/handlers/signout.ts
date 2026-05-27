import type { RequestHandler } from "express";
import { z } from "zod";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";

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
    first_name: z.string().optional().default(""),
    last_name: z.string().optional().default(""),
    email: z.string().email(),
    phone: z.string().optional(),
    "Membership Name": z.string().optional()
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
  membership: {
    persons: MembershipPerson[];
  };
};

const normalizeName = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

const findPersonByEmail = async (clubId: string, input: SignOutWebhookPayload): Promise<FoundPerson | null> => {
  const emailMatch = await prisma.person.findFirst({
    where: {
      clubId,
      email: input.email,
      membership: { status: "ACTIVE" }
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      membership: {
        select: {
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
      membership: { status: "ACTIVE" }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      membership: {
        select: {
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

    const person = await findPersonByEmail(club.id, input);

    if (!person) {
      res.status(404).json({ valid: false, message: "Member not found. Please see staff." });
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
      res.status(404).json({ valid: false, message: "Not currently checked in" });
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
