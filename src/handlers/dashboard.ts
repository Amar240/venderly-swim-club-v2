import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getNewYorkTodayBounds } from "../lib/timezone";
import { HttpError } from "../middleware/errorHandler";
import type { StaffResponse } from "../middleware/jwtAuth";

const recentQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((value) => {
      const parsed = value ? Number.parseInt(value, 10) : 10;
      return Number.isNaN(parsed) ? 10 : Math.min(Math.max(parsed, 1), 50);
    })
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(2)
});

const manualSignoutSchema = z
  .object({
    personId: z.string().min(1).optional(),
    membershipId: z.string().min(1).optional(),
    scope: z.enum(["person", "membership"]).default("person")
  })
  .refine((value) => (value.scope === "person" && value.personId) || (value.scope === "membership" && value.membershipId), {
    message: "personId required for scope=person, membershipId for scope=membership"
  });

const manualCheckinSchema = z.object({
  personId: z.string().min(1),
  numGuests: z.number().int().min(0).max(10).optional().default(0)
});

const updateCapacitySchema = z.object({
  capacity: z.number().int().min(1).max(2000)
});

const getStaffClubId = (res: StaffResponse): string => res.locals.staff.clubId;

const fullName = (person: { firstName: string; lastName: string }): string =>
  `${person.firstName} ${person.lastName}`.trim();

export const getDashboardSummary: RequestHandler = async (_req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = getStaffClubId(staffResponse);
    const todayBounds = getNewYorkTodayBounds();

    const [club, visitedTodayAgg, currentlyInPoolAgg, guestsToday, newMembersToday] = await Promise.all([
      prisma.club.findUnique({
        where: { id: clubId },
        select: { maxCapacity: true }
      }),
      prisma.checkinEvent.aggregate({
        where: {
          clubId,
          eventType: "check_in",
          checkedInAt: {
            gte: todayBounds.start,
            lt: todayBounds.end
          }
        },
        _count: { _all: true },
        _sum: { numGuests: true }
      }),
      prisma.checkinEvent.aggregate({
        where: {
          clubId,
          isActive: true,
          checkedInAt: {
            gte: todayBounds.start
          }
        },
        _count: { _all: true },
        _sum: { numGuests: true }
      }),
      prisma.checkinEvent.aggregate({
        where: {
          clubId,
          eventType: "check_in",
          checkedInAt: {
            gte: todayBounds.start,
            lt: todayBounds.end
          }
        },
        _sum: { numGuests: true }
      }),
      prisma.membership.count({
        where: {
          clubId,
          submittedAt: {
            gte: todayBounds.start,
            lt: todayBounds.end
          }
        }
      })
    ]);

    if (!club) {
      throw new HttpError(404, "CLUB_NOT_FOUND", "Club was not found");
    }

    const poolCapacity = club.maxCapacity;
    const visitedTodayMembers = visitedTodayAgg._count._all ?? 0;
    const visitedTodayGuests = visitedTodayAgg._sum.numGuests ?? 0;
    const visitedToday = visitedTodayMembers + visitedTodayGuests;
    const currentlyInPoolMembers = currentlyInPoolAgg._count._all ?? 0;
    const currentlyInPoolGuests = currentlyInPoolAgg._sum.numGuests ?? 0;
    const currentlyInPool = currentlyInPoolMembers + currentlyInPoolGuests;

    res.json({
      visitedToday,
      visitedTodayMembers,
      visitedTodayGuests,
      currentlyInPool,
      currentlyInPoolMembers,
      currentlyInPoolGuests,
      guestsToday: guestsToday._sum.numGuests ?? 0,
      newMembersToday,
      poolCapacity,
      capacityPercent: poolCapacity === 0 ? 0 : (currentlyInPool / poolCapacity) * 100
    });
  } catch (error) {
    next(error);
  }
};

export const getActiveCheckins: RequestHandler = async (_req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = getStaffClubId(staffResponse);
    const todayBounds = getNewYorkTodayBounds();
    const checkins = await prisma.checkinEvent.findMany({
      where: {
        clubId,
        isActive: true,
        checkedInAt: {
          gte: todayBounds.start
        }
      },
      orderBy: { checkedInAt: "asc" },
      select: {
        id: true,
        checkedInAt: true,
        numGuests: true,
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            membership: {
              select: { tier: true }
            }
          }
        }
      }
    });

    res.json({
      count: checkins.length,
      persons: checkins.map((checkin) => ({
        personId: checkin.person.id,
        firstName: checkin.person.firstName,
        lastName: checkin.person.lastName,
        membershipTier: checkin.person.membership.tier,
        checkedInAt: checkin.checkedInAt.toISOString(),
        numGuests: checkin.numGuests,
        checkinEventId: checkin.id
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const getRecentCheckinEvents: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = getStaffClubId(staffResponse);
    const { limit } = recentQuerySchema.parse(req.query);
    const checkins = await prisma.checkinEvent.findMany({
      where: { clubId },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        eventType: true,
        checkedInAt: true,
        signedOutAt: true,
        numGuests: true,
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            membership: {
              select: { tier: true }
            }
          }
        }
      }
    });

    const events = checkins
      .map((event) => ({
        eventId: event.id,
        personId: event.person.id,
        eventType: event.signedOutAt ? "sign_out" : event.eventType,
        personName: fullName(event.person),
        membershipTier: event.person.membership.tier,
        timestamp: (event.signedOutAt ?? event.checkedInAt).toISOString(),
        numGuests: event.numGuests
      }))
      .sort((first, second) => Date.parse(second.timestamp) - Date.parse(first.timestamp));

    res.json({ events });
  } catch (error) {
    next(error);
  }
};

export const searchMembers: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = getStaffClubId(staffResponse);
    const { q } = searchQuerySchema.parse(req.query);
    const persons = await prisma.person.findMany({
      where: {
        clubId,
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } }
        ]
      },
      take: 20,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        membershipId: true,
        checkinEvents: {
          where: { isActive: true },
          select: { id: true },
          take: 1
        },
        membership: {
          select: {
            tier: true,
            maxMembers: true,
            status: true,
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

    res.json({
      matches: persons.map((person) => ({
        personId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email ?? "",
        phone: person.phone ?? "",
        membershipTier: person.membership.tier,
        maxMembers: person.membership.maxMembers,
        membershipStatus: person.membership.status,
        isCurrentlyIn: person.checkinEvents.length > 0,
        familyMembers: person.membership.persons
          .filter((familyMember) => familyMember.id !== person.id)
          .map((familyMember) => fullName(familyMember))
          .filter((name) => name.length > 0)
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const manualSignout: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = getStaffClubId(staffResponse);
    const staffId = staffResponse.locals.staff.id;
    const { personId, membershipId, scope } = manualSignoutSchema.parse(req.body);

    if (scope === "membership") {
      if (!membershipId) {
        throw new HttpError(400, "MEMBERSHIP_ID_REQUIRED", "membershipId is required");
      }

      const membership = await prisma.membership.findFirst({
        where: {
          id: membershipId,
          clubId
        },
        select: { id: true }
      });

      if (!membership) {
        throw new HttpError(404, "MEMBERSHIP_NOT_FOUND", "Membership was not found");
      }

      const activeCheckins = await prisma.checkinEvent.findMany({
        where: {
          clubId,
          membershipId: membership.id,
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

      await prisma.$transaction(async (transaction) => {
        await transaction.checkinEvent.updateMany({
          where: {
            id: {
              in: activeCheckins.map((checkin) => checkin.id)
            }
          },
          data: {
            isActive: false,
            signedOutAt: new Date(),
            staffId
          }
        });
      });

      const signedOut = activeCheckins.map((checkin) => fullName(checkin.person));
      const count = signedOut.length;

      res.json({
        success: true,
        message: `Signed out ${count} ${count === 1 ? "person" : "people"}`,
        signedOut
      });
      return;
    }

    if (!personId) {
      throw new HttpError(400, "PERSON_ID_REQUIRED", "personId is required");
    }

    const activeCheckin = await prisma.checkinEvent.findFirst({
      where: {
        clubId,
        personId,
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

    if (!activeCheckin) {
      throw new HttpError(404, "ACTIVE_CHECKIN_NOT_FOUND", "Active check-in was not found");
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.checkinEvent.update({
        where: { id: activeCheckin.id },
        data: {
          isActive: false,
          signedOutAt: new Date(),
          staffId
        }
      });
    });

    res.json({
      success: true,
      message: `Signed out ${fullName(activeCheckin.person)}`
    });
  } catch (error) {
    next(error);
  }
};

export const manualCheckin: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = getStaffClubId(staffResponse);
    const staffId = staffResponse.locals.staff.id;
    const { personId, numGuests } = manualCheckinSchema.parse(req.body);

    const person = await prisma.person.findFirst({
      where: { id: personId, clubId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        membershipId: true,
        membership: {
          select: {
            id: true,
            status: true,
            tier: true,
            maxMembers: true,
            guestPassesTotal: true,
            guestPassesUsed: true
          }
        }
      }
    });

    if (!person) {
      throw new HttpError(404, "PERSON_NOT_FOUND", "Member was not found");
    }

    if (person.membership.status !== "ACTIVE") {
      throw new HttpError(
        422,
        "MEMBERSHIP_NOT_ACTIVE",
        `Membership is ${person.membership.status.toLowerCase()}`
      );
    }

    const existingActive = await prisma.checkinEvent.findFirst({
      where: { personId: person.id, isActive: true },
      select: { id: true }
    });

    if (existingActive) {
      throw new HttpError(409, "ALREADY_CHECKED_IN", "Member is already checked in");
    }

    const guestPassesRemaining = person.membership.guestPassesTotal - person.membership.guestPassesUsed;

    if (numGuests > 0 && numGuests > guestPassesRemaining) {
      throw new HttpError(403, "INSUFFICIENT_GUEST_PASSES", "Not enough guest passes available");
    }

    const activeMembershipCheckins = await prisma.checkinEvent.count({
      where: { membershipId: person.membershipId, isActive: true }
    });

    if (activeMembershipCheckins >= person.membership.maxMembers) {
      throw new HttpError(403, "MEMBERSHIP_AT_CAPACITY", "Membership is at capacity");
    }

    const checkinEvent = await prisma.$transaction(async (transaction) => {
      const event = await transaction.checkinEvent.create({
        data: {
          clubId,
          personId: person.id,
          membershipId: person.membershipId,
          staffId,
          eventType: "check_in",
          isActive: true,
          checkedInAt: new Date(),
          numGuests,
          source: "staff_manual"
        },
        select: { id: true, checkedInAt: true }
      });

      if (numGuests > 0) {
        await transaction.membership.update({
          where: { id: person.membership.id },
          data: {
            guestPassesUsed: {
              increment: numGuests
            }
          }
        });
      }

      return event;
    });

    res.json({
      success: true,
      message: `Welcome ${person.firstName}!`,
      personName: fullName(person),
      checkinEventId: checkinEvent.id,
      checkedInAt: checkinEvent.checkedInAt.toISOString(),
      membershipTier: person.membership.tier,
      maxMembers: person.membership.maxMembers,
      currentlyCheckedIn: activeMembershipCheckins + 1,
      guestsCheckedIn: numGuests,
      guestPassesRemaining: person.membership.guestPassesTotal - (person.membership.guestPassesUsed + numGuests)
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      next(new HttpError(409, "ALREADY_CHECKED_IN", "Member is already checked in"));
      return;
    }

    next(error);
  }
};

export const updateClubCapacity: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { capacity } = updateCapacitySchema.parse(req.body);

    const updated = await prisma.club.update({
      where: { id: clubId },
      data: { maxCapacity: capacity },
      select: { id: true, maxCapacity: true }
    });

    res.json({
      success: true,
      capacity: updated.maxCapacity
    });
  } catch (error) {
    next(error);
  }
};
