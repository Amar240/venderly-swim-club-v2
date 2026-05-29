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
      .passthrough()
      .optional(),
    location_id: z.string().min(1).optional(),
    contact_id: z.string().optional(),
    first_name: z.string().optional().default(""),
    last_name: z.string().optional().default(""),
    email: z.string().email(),
    phone: z.string().optional(),
    "Membership Name": z.string().optional(),
    "Number of members attending": z.string().optional(),
    "Any guests?": z.string().optional(),
    "# of Additional Members Signing In Now": z.union([z.string(), z.number()]).optional(),
    "Full Name of 1st Member": z.string().optional(),
    "Full Name of 2nd Member": z.string().optional(),
    "Full Name of 3rd Member": z.string().optional(),
    "Full Name of 4th Member": z.string().optional(),
    "Full Name of 5th Member": z.string().optional(),
    "Full Name of 6th Member": z.string().optional(),
    "Full Name of 7th Member": z.string().optional(),
    "Full Name of 8th Member": z.string().optional(),
    "# of guests entering": z.union([z.string(), z.number()]).optional(),
    "Phone(Membership holder phone)": z.string().optional(),
    "Select Option:": z.string().optional().default("Sign-In")
  })
  .catchall(z.unknown());

type CheckInWebhookPayload = z.infer<typeof checkInWebhookSchema>;

const FAMILY_ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"] as const;

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

type BatchPerson = {
  id: string;
  firstName: string;
  lastName: string;
  checkinEvents: { id: string }[];
};

type FoundHousehold = {
  membership: {
    id: string;
    status: string;
    tier: string;
    maxMembers: number;
    guestPassesTotal: number;
    guestPassesUsed: number;
    persons: BatchPerson[];
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

const collectNamedMembers = (input: CheckInWebhookPayload): string[] =>
  FAMILY_ORDINALS.map((ordinal) => input[`Full Name of ${ordinal} Member`])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

const parseBatchGuestCount = (input: CheckInWebhookPayload): number => {
  const guestsYes = String(input["Any guests?"] ?? "").trim().toLowerCase() === "yes";

  if (!guestsYes) {
    return 0;
  }

  const parsed = Number.parseInt(String(input["# of guests entering"] ?? "0"), 10);
  return Number.isNaN(parsed) ? 0 : Math.max(parsed, 0);
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

const selectBatchHousehold = {
  membership: {
    select: {
      id: true,
      status: true,
      tier: true,
      maxMembers: true,
      guestPassesTotal: true,
      guestPassesUsed: true,
      persons: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          checkinEvents: {
            where: { isActive: true },
            select: { id: true },
            take: 1
          }
        },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
      }
    }
  }
} satisfies Prisma.PersonSelect;

const findHouseholdForBatch = async (clubId: string, input: CheckInWebhookPayload): Promise<FoundHousehold | null> => {
  const emailMatch = await prisma.person.findFirst({
    where: {
      clubId,
      email: input.email
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: selectBatchHousehold
  });

  if (emailMatch) {
    return emailMatch;
  }

  const phone = cleanPhoneNumber(input.phone ?? input["Phone(Membership holder phone)"]);

  if (!phone) {
    return null;
  }

  return prisma.person.findFirst({
    where: {
      clubId,
      phone
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: selectBatchHousehold
  });
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

const handleBatchCheckIn = async (
  clubId: string,
  input: CheckInWebhookPayload,
  namedMembers: string[],
  res: Parameters<RequestHandler>[1]
): Promise<void> => {
  const household = await findHouseholdForBatch(clubId, input);

  if (!household) {
    res.status(404).json({ valid: false, message: "Member not found. Please see staff." });
    return;
  }

  const membership = household.membership;
  const matched: BatchPerson[] = [];
  const unmatched: string[] = [];

  for (const memberName of namedMembers) {
    const householdPerson = membership.persons.find((person) => normalizeName(fullName(person)) === normalizeName(memberName));

    if (householdPerson) {
      matched.push(householdPerson);
    } else {
      unmatched.push(memberName);
    }
  }

  if (unmatched.length > 0) {
    res.status(422).json({
      valid: false,
      code: "BATCH_NAME_UNMATCHED",
      message: `We couldn't find: ${unmatched.join(", ")}. Please see staff.`
    });
    return;
  }

  if (membership.status !== "ACTIVE") {
    res.status(422).json({
      valid: false,
      code: "MEMBERSHIP_NOT_ACTIVE",
      message: "Membership is not active. Please see staff."
    });
    return;
  }

  const alreadyCheckedIn = matched.find((person) => person.checkinEvents.length > 0);

  if (alreadyCheckedIn) {
    res.status(409).json({
      valid: false,
      code: "ALREADY_CHECKED_IN",
      message: `${fullName(alreadyCheckedIn)} is already checked in. Please see staff.`
    });
    return;
  }

  const currentActive = membership.persons.filter((person) => person.checkinEvents.length > 0).length;

  if (currentActive + matched.length > membership.maxMembers) {
    res.status(403).json({
      valid: false,
      code: "MEMBERSHIP_AT_CAPACITY",
      message: "This would exceed your membership capacity. Please see staff."
    });
    return;
  }

  const numGuests = parseBatchGuestCount(input);
  const guestPassesRemaining = membership.guestPassesTotal - membership.guestPassesUsed;

  if (numGuests > guestPassesRemaining) {
    res.status(403).json({
      valid: false,
      code: "INSUFFICIENT_GUEST_PASSES",
      message: "Not enough guest passes. Please see staff or buy more."
    });
    return;
  }

  await prisma.$transaction(async (transaction) => {
    for (const [index, person] of matched.entries()) {
      await transaction.checkinEvent.create({
        data: {
          clubId,
          personId: person.id,
          membershipId: membership.id,
          eventType: "check_in",
          isActive: true,
          checkedInAt: new Date(),
          numGuests: index === 0 ? numGuests : 0,
          source: "qr_form_batch"
        }
      });
    }

    if (numGuests > 0) {
      await transaction.membership.update({
        where: { id: membership.id },
        data: {
          guestPassesUsed: {
            increment: numGuests
          }
        }
      });
    }
  });

  res.status(200).json({
    valid: true,
    message: `Welcome ${matched[0]?.firstName ?? "Member"}!`,
    checkedIn: matched.map((person) => fullName(person)),
    numGuests,
    guestPassesRemaining: membership.guestPassesTotal - (membership.guestPassesUsed + numGuests),
    currentlyCheckedIn: currentActive + matched.length
  });
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

    const action = input["Select Option:"].trim();

    if (action !== "Sign-In" && action !== "Sign-Out") {
      res.status(400).json({ valid: false, message: "Invalid check-in option" });
      return;
    }

    const namedMembers = collectNamedMembers(input);
    const isBatchPayload = namedMembers.length > 0;

    if (isBatchPayload) {
      if (action === "Sign-Out") {
        res.status(400).json({
          valid: false,
          message: "Batch sign-out belongs on the sign-out form. Please see staff."
        });
        return;
      }

      await handleBatchCheckIn(club.id, input, namedMembers, res);
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
