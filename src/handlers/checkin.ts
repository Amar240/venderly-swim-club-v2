import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";

const checkInWebhookSchema = z
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
    "Membership Name": z.string().optional(),
    "Number of members attending": z.string().optional(),
    "Any guests?": z.string().optional(),
    "Select Option:": z.string().min(1)
  })
  .catchall(z.unknown());

type CheckInWebhookPayload = z.infer<typeof checkInWebhookSchema>;

type MembershipPerson = {
  id: string;
  firstName: string;
  lastName: string;
};

type FoundPerson = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  membershipId: string;
  membership: {
    id: string;
    tier: string;
    maxMembers: number;
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

const fullName = (person: { firstName: string; lastName: string }): string =>
  `${person.firstName} ${person.lastName}`.trim();

const parseGuestCount = (rawGuests: string | undefined): number => {
  if (!rawGuests) {
    return 0;
  }

  const match = rawGuests.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
};

const findPersonByEmail = async (clubId: string, email: string, firstName: string): Promise<FoundPerson | null> => {
  const emailMatch = await prisma.person.findFirst({
    where: {
      clubId,
      email,
      membership: { status: "ACTIVE" }
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      membershipId: true,
      membership: {
        select: {
          id: true,
          tier: true,
          maxMembers: true,
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

  const matchingMembershipPerson = emailMatch.membership.persons.find(
    (person) => normalizeName(person.firstName) === normalizeName(firstName)
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
      email: true,
      phone: true,
      membershipId: true,
      membership: {
        select: {
          id: true,
          tier: true,
          maxMembers: true,
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

const findPersonByPhone = async (clubId: string, phone: string | undefined): Promise<FoundPerson | null> => {
  if (!phone) {
    return null;
  }

  return prisma.person.findFirst({
    where: {
      clubId,
      phone,
      membership: { status: "ACTIVE" }
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      membershipId: true,
      membership: {
        select: {
          id: true,
          tier: true,
          maxMembers: true,
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

const findPersonByMembershipName = async (
  clubId: string,
  firstName: string,
  membershipName: string | undefined
): Promise<FoundPerson | null> => {
  if (!membershipName) {
    return null;
  }

  const primaryPeople = await prisma.person.findMany({
    where: {
      clubId,
      isPrimary: true,
      membership: { status: "ACTIVE" }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      membershipId: true,
      membership: {
        select: {
          id: true,
          tier: true,
          maxMembers: true,
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

  const matchingPrimaryPerson = primaryPeople.find((person) => normalizeName(fullName(person)) === normalizeName(membershipName));

  if (!matchingPrimaryPerson) {
    return null;
  }

  const matchingFamilyPerson = matchingPrimaryPerson.membership.persons.find(
    (person) => normalizeName(person.firstName) === normalizeName(firstName)
  );

  if (!matchingFamilyPerson) {
    return null;
  }

  if (matchingFamilyPerson.id === matchingPrimaryPerson.id) {
    return matchingPrimaryPerson;
  }

  const person = await prisma.person.findFirst({
    where: {
      id: matchingFamilyPerson.id,
      clubId,
      membership: { status: "ACTIVE" }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      membershipId: true,
      membership: {
        select: {
          id: true,
          tier: true,
          maxMembers: true,
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

  return person;
};

const findMemberForCheckIn = async (clubId: string, input: CheckInWebhookPayload): Promise<FoundPerson | null> => {
  const emailMatch = await findPersonByEmail(clubId, input.email, input.first_name);

  if (emailMatch) {
    return emailMatch;
  }

  const phoneMatch = await findPersonByPhone(clubId, cleanPhoneNumber(input.phone));

  if (phoneMatch) {
    return phoneMatch;
  }

  return findPersonByMembershipName(clubId, input.first_name, input["Membership Name"]);
};

const getFamilyMemberNames = (person: FoundPerson): string[] =>
  person.membership.persons
    .filter((familyMember) => familyMember.id !== person.id)
    .map((familyMember) => fullName(familyMember))
    .filter((name) => name.length > 0);

const handleSignOut = async (person: FoundPerson): Promise<{ valid: true; message: string } | null> => {
  const activeCheckin = await prisma.checkinEvent.findFirst({
    where: {
      personId: person.id,
      isActive: true
    },
    select: { id: true }
  });

  if (!activeCheckin) {
    return null;
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

  return {
    valid: true,
    message: `Goodbye ${person.firstName}!`
  };
};

export const checkInHandler: RequestHandler = async (req, res, next) => {
  try {
    const expectedSecret = process.env.WEBHOOK_SECRET;
    const providedSecret = req.header("X-Webhook-Secret");

    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
      res.status(401).json({ valid: false, message: "Invalid webhook secret" });
      return;
    }

    const input = checkInWebhookSchema.parse(req.body);
    const club = await prisma.club.findFirst({
      where: {
        ghlLocationId: input.location.id,
        isActive: true
      },
      select: { id: true }
    });

    if (!club) {
      res.status(422).json({ valid: false, message: "Club not found" });
      return;
    }

    const action = input["Select Option:"].trim();

    if (action !== "Sign-In" && action !== "Sign-Out") {
      res.status(400).json({ valid: false, message: "Invalid check-in option" });
      return;
    }

    const person = await findMemberForCheckIn(club.id, input);

    if (!person) {
      res.status(404).json({ valid: false, message: "Member not found. Please see staff." });
      return;
    }

    if (action === "Sign-Out") {
      const signOutResult = await handleSignOut(person);

      if (!signOutResult) {
        res.status(404).json({ valid: false, message: "No active check-in found" });
        return;
      }

      res.status(200).json(signOutResult);
      return;
    }

    const activeMembershipCheckins = await prisma.checkinEvent.count({
      where: {
        membershipId: person.membershipId,
        isActive: true
      }
    });

    if (activeMembershipCheckins >= person.membership.maxMembers) {
      res.status(403).json({ valid: false, message: "Membership is at capacity" });
      return;
    }

    const existingCheckin = await prisma.checkinEvent.findFirst({
      where: {
        personId: person.id,
        isActive: true
      },
      select: { id: true }
    });

    if (existingCheckin) {
      res.status(409).json({ valid: false, message: "Already checked in" });
      return;
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.checkinEvent.create({
        data: {
          clubId: club.id,
          personId: person.id,
          membershipId: person.membershipId,
          eventType: "check_in",
          isActive: true,
          checkedInAt: new Date(),
          numGuests: parseGuestCount(input["Any guests?"]),
          source: "qr_form"
        }
      });
    });

    res.status(200).json({
      valid: true,
      message: `Welcome ${person.firstName}!`,
      personName: fullName(person),
      membershipTier: person.membership.tier,
      maxMembers: person.membership.maxMembers,
      currentlyCheckedIn: activeMembershipCheckins + 1,
      familyMembers: getFamilyMemberNames(person)
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ valid: false, message: "Already checked in" });
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown check-in webhook error";
    logger.error("Check-in webhook failed", { message });
    next(error);
  }
};
