import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import type { StaffResponse } from "../middleware/jwtAuth";

const NEW_YORK_TIME_ZONE = "America/New_York";

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

const manualSignoutSchema = z.object({
  personId: z.string().min(1)
});

const manualCheckinSchema = z.object({
  personId: z.string().min(1)
});

const getStaffClubId = (res: StaffResponse): string => res.locals.staff.clubId;

const fullName = (person: { firstName: string; lastName: string }): string =>
  `${person.firstName} ${person.lastName}`.trim();

const getTimeZoneParts = (
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const getPart = (type: string): number => {
    const value = parts.find((part) => part.type === type)?.value;
    return value ? Number.parseInt(value, 10) : 0;
  };

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hour: getPart("hour"),
    minute: getPart("minute"),
    second: getPart("second")
  };
};

const getTimeZoneOffsetMs = (date: Date, timeZone: string): number => {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
};

const localDateTimeToUtc = (year: number, month: number, day: number, timeZone: string): Date => {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
};

const getNewYorkTodayBounds = (): { start: Date; end: Date } => {
  const nowParts = getTimeZoneParts(new Date(), NEW_YORK_TIME_ZONE);

  return {
    start: localDateTimeToUtc(nowParts.year, nowParts.month, nowParts.day, NEW_YORK_TIME_ZONE),
    end: localDateTimeToUtc(nowParts.year, nowParts.month, nowParts.day + 1, NEW_YORK_TIME_ZONE)
  };
};

export const getDashboardSummary: RequestHandler = async (_req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = getStaffClubId(staffResponse);
    const todayBounds = getNewYorkTodayBounds();

    const [club, visitedToday, currentlyInPool, guestsToday, newMembersToday] = await Promise.all([
      prisma.club.findUnique({
        where: { id: clubId },
        select: { maxCapacity: true }
      }),
      prisma.checkinEvent.count({
        where: {
          clubId,
          eventType: "check_in",
          checkedInAt: {
            gte: todayBounds.start,
            lt: todayBounds.end
          }
        }
      }),
      prisma.checkinEvent.count({
        where: {
          clubId,
          isActive: true
        }
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

    res.json({
      visitedToday,
      currentlyInPool,
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
    const checkins = await prisma.checkinEvent.findMany({
      where: {
        clubId,
        isActive: true
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
    const { personId } = manualSignoutSchema.parse(req.body);
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
          signedOutAt: new Date()
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
    const { personId } = manualCheckinSchema.parse(req.body);

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
            maxMembers: true
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

    const activeMembershipCheckins = await prisma.checkinEvent.count({
      where: { membershipId: person.membershipId, isActive: true }
    });

    if (activeMembershipCheckins >= person.membership.maxMembers) {
      throw new HttpError(403, "MEMBERSHIP_AT_CAPACITY", "Membership is at capacity");
    }

    const checkinEvent = await prisma.checkinEvent.create({
      data: {
        clubId,
        personId: person.id,
        membershipId: person.membershipId,
        staffId,
        eventType: "check_in",
        isActive: true,
        checkedInAt: new Date(),
        source: "staff_manual"
      },
      select: { id: true, checkedInAt: true }
    });

    res.json({
      success: true,
      message: `Welcome ${person.firstName}!`,
      personName: fullName(person),
      checkinEventId: checkinEvent.id,
      checkedInAt: checkinEvent.checkedInAt.toISOString(),
      membershipTier: person.membership.tier,
      maxMembers: person.membership.maxMembers,
      currentlyCheckedIn: activeMembershipCheckins + 1
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      next(new HttpError(409, "ALREADY_CHECKED_IN", "Member is already checked in"));
      return;
    }

    next(error);
  }
};
