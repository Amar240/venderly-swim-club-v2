import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getNewYorkTodayBounds } from "../lib/timezone";
import { HttpError } from "../middleware/errorHandler";
import { jwtAuth, type StaffResponse } from "../middleware/jwtAuth";
import {
  addPersonToMembership,
  deletePerson,
  updateMembershipAddress,
  updateMembershipEmergency,
  updatePerson
} from "../handlers/memberEdit";
import { adminRouter } from "./admin";
import { authRouter } from "./auth";
import { dashboardRouter } from "./dashboard";
import { reportsRouter } from "./reports";

const listMembersQuerySchema = z.object({
  q: z.string().trim().optional(),
  tier: z.string().trim().optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => {
      const parsed = value ? Number.parseInt(value, 10) : 50;
      return Number.isNaN(parsed) ? 50 : Math.min(Math.max(parsed, 1), 100);
    })
});

const memberParamsSchema = z.object({
  id: z.string().min(1)
});

const listMembershipsQuerySchema = z.object({
  q: z.string().trim().optional(),
  tier: z.string().trim().optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => {
      const parsed = value ? Number.parseInt(value, 10) : 100;
      return Number.isNaN(parsed) ? 100 : Math.min(Math.max(parsed, 1), 200);
    })
});

const fullName = (person: { firstName: string; lastName: string }): string =>
  `${person.firstName} ${person.lastName}`.trim();

const normalizeTier = (tier: string | undefined): "all" | "family" | "adult" | "student" => {
  const normalized = tier?.toLowerCase();

  if (normalized === "family" || normalized === "adult" || normalized === "student") {
    return normalized;
  }

  return "all";
};

const tierWhere = (tier: "all" | "family" | "adult" | "student") => {
  if (tier === "all") {
    return undefined;
  }

  return {
    contains: tier,
    mode: "insensitive" as const
  };
};

export const apiV1Router = Router();
const membersRouter = Router();
const membershipsRouter = Router();

apiV1Router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    data: {
      service: "venderly-swim-club-v2",
      apiVersion: "v1",
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  });
});

apiV1Router.use("/auth", authRouter);
apiV1Router.use("/dashboard", dashboardRouter);
apiV1Router.use("/admin", adminRouter);
apiV1Router.use("/reports", reportsRouter);
apiV1Router.use("/members", membersRouter);
apiV1Router.use("/memberships", membershipsRouter);

membersRouter.use(jwtAuth);
membershipsRouter.use(jwtAuth);

membershipsRouter.get("/", async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { q, tier, limit } = listMembershipsQuerySchema.parse(req.query);
    const selectedTier = normalizeTier(tier);
    const tierFilter = tierWhere(selectedTier);
    // Match the dashboard's definition of "in pool": active AND checked in today (NY).
    // Stale active events (forgotten sign-outs before the nightly auto sign-out runs)
    // must not show as currently present.
    const todayBounds = getNewYorkTodayBounds();

    const memberships = await prisma.membership.findMany({
      where: {
        clubId,
        ...(tierFilter ? { tier: tierFilter } : {}),
        ...(q
          ? {
              persons: {
                some: {
                  status: "ACTIVE",
                  OR: [
                    { firstName: { contains: q, mode: "insensitive" } },
                    { lastName: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } }
                  ]
                }
              }
            }
          : {})
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        tier: true,
        maxMembers: true,
        status: true,
        guestPassesTotal: true,
        guestPassesUsed: true,
        persons: {
          where: { status: "ACTIVE" },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            isPrimary: true,
            checkinEvents: {
              where: {
                isActive: true,
                checkedInAt: { gte: todayBounds.start, lt: todayBounds.end }
              },
              select: { id: true },
              take: 1
            }
          }
        }
      }
    });

    res.json({
      memberships: memberships.map((membership) => {
        const primary = membership.persons.find((person) => person.isPrimary) ?? membership.persons[0];
        const membersInPool = membership.persons.filter((person) => person.checkinEvents.length > 0).length;

        return {
          membershipId: membership.id,
          accountHolderPersonId: primary?.id ?? null,
          accountHolderName: primary ? fullName(primary) : "Unknown",
          accountHolderFirstName: primary?.firstName ?? "",
          accountHolderLastName: primary?.lastName ?? "",
          tier: membership.tier,
          maxMembers: membership.maxMembers,
          status: membership.status,
          guestPassesTotal: membership.guestPassesTotal,
          guestPassesUsed: membership.guestPassesUsed,
          familyCount: membership.persons.length,
          isAnyMemberCurrentlyIn: membersInPool > 0,
          membersInPool
        };
      })
    });
  } catch (error) {
    next(error);
  }
});

membersRouter.get("/", async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { q, tier, limit } = listMembersQuerySchema.parse(req.query);
    const selectedTier = normalizeTier(tier);
    const tierFilter = tierWhere(selectedTier);

    const persons = await prisma.person.findMany({
      where: {
        clubId,
        status: "ACTIVE", // soft-deleted members are hidden from search
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } }
              ]
            }
          : {}),
        membership: {
          ...(tierFilter ? { tier: tierFilter } : {})
        }
      },
      take: limit,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        checkinEvents: {
          where: { isActive: true },
          select: { id: true },
          take: 1
        },
        membership: {
          select: {
            id: true,
            tier: true,
            maxMembers: true,
            status: true,
            guestPassesTotal: true,
            guestPassesUsed: true,
            persons: {
              select: { id: true }
            }
          }
        }
      }
    });

    res.json({
      members: persons.map((person) => ({
        personId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email ?? "",
        phone: person.phone ?? "",
        personStatus: person.status,
        membershipId: person.membership.id,
        membershipTier: person.membership.tier,
        maxMembers: person.membership.maxMembers,
        membershipStatus: person.membership.status,
        guestPassesTotal: person.membership.guestPassesTotal,
        guestPassesUsed: person.membership.guestPassesUsed,
        familyCount: person.membership.persons.length,
        isCurrentlyIn: person.checkinEvents.length > 0
      }))
    });
  } catch (error) {
    next(error);
  }
});

membersRouter.patch("/persons/:id", updatePerson);
membersRouter.delete("/persons/:id", deletePerson);
membersRouter.post("/memberships/:membershipId/persons", addPersonToMembership);
membersRouter.patch("/memberships/:id/address", updateMembershipAddress);
membersRouter.patch("/memberships/:id/emergency", updateMembershipEmergency);

membersRouter.get("/:id", async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { id } = memberParamsSchema.parse(req.params);
    const person = await prisma.person.findFirst({
      where: { id, clubId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        age: true,
        relationship: true,
        allergies: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        emergencyContactEmail: true,
        notes: true,
        isPrimary: true,
        status: true,
        checkinEvents: {
          orderBy: { checkedInAt: "desc" },
          take: 25,
          select: {
            id: true,
            eventType: true,
            checkedInAt: true,
            signedOutAt: true,
            isActive: true,
            numGuests: true,
            source: true
          }
        },
        membership: {
          select: {
            id: true,
            tier: true,
            maxMembers: true,
            status: true,
            startsAt: true,
            endsAt: true,
            addressStreet: true,
            addressCity: true,
            addressState: true,
            addressPostalCode: true,
            addressCountry: true,
            submittedAt: true,
            externalOrderId: true,
            emailVerified: true,
            phoneVerified: true,
            paymentAmountCents: true,
            guestPassesTotal: true,
            guestPassesUsed: true,
            persons: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                age: true,
                relationship: true,
                allergies: true,
                emergencyContactName: true,
                emergencyContactPhone: true,
                emergencyContactEmail: true,
                notes: true,
                isPrimary: true,
                status: true,
                checkinEvents: {
                  where: { isActive: true },
                  select: { id: true, checkedInAt: true },
                  take: 1
                }
              }
            }
          }
        }
      }
    });

    if (!person) {
      throw new HttpError(404, "MEMBER_NOT_FOUND", "Member was not found");
    }

    const todayBounds = getNewYorkTodayBounds();
    const [currentGuestsAgg, guestsUsedTodayAgg] = await Promise.all([
      prisma.checkinEvent.aggregate({
        where: {
          membershipId: person.membership.id,
          isActive: true
        },
        _sum: { numGuests: true }
      }),
      prisma.checkinEvent.aggregate({
        where: {
          membershipId: person.membership.id,
          eventType: "check_in",
          checkedInAt: {
            gte: todayBounds.start,
            lt: todayBounds.end
          }
        },
        _sum: { numGuests: true }
      })
    ]);
    const currentGuestsInPool = currentGuestsAgg._sum.numGuests ?? 0;
    const guestPassesUsedToday = guestsUsedTodayAgg._sum.numGuests ?? 0;

    res.json({
      member: {
        personId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        name: fullName(person),
        email: person.email ?? "",
        phone: person.phone ?? "",
        age: person.age,
        relationship: person.relationship,
        allergies: person.allergies ?? "",
        emergencyContactName: person.emergencyContactName ?? "",
        emergencyContactPhone: person.emergencyContactPhone ?? "",
        emergencyContactEmail: person.emergencyContactEmail ?? "",
        notes: person.notes ?? "",
        isPrimary: person.isPrimary,
        personStatus: person.status,
        membership: {
          membershipId: person.membership.id,
          tier: person.membership.tier,
          maxMembers: person.membership.maxMembers,
          status: person.membership.status,
          startsAt: person.membership.startsAt?.toISOString() ?? null,
          endsAt: person.membership.endsAt?.toISOString() ?? null,
          addressStreet: person.membership.addressStreet ?? "",
          addressCity: person.membership.addressCity ?? "",
          addressState: person.membership.addressState ?? "",
          addressPostalCode: person.membership.addressPostalCode ?? "",
          addressCountry: person.membership.addressCountry ?? "",
          submittedAt: person.membership.submittedAt?.toISOString() ?? null,
          externalOrderId: person.membership.externalOrderId ?? "",
          emailVerified: person.membership.emailVerified,
          phoneVerified: person.membership.phoneVerified,
          paymentAmountCents: person.membership.paymentAmountCents,
          guestPassesTotal: person.membership.guestPassesTotal,
          guestPassesUsed: person.membership.guestPassesUsed,
          currentGuestsInPool,
          guestPassesUsedToday
        },
        family: person.membership.persons
          .filter((familyMember) => familyMember.status === "ACTIVE")
          .map((familyMember) => ({
            personId: familyMember.id,
            firstName: familyMember.firstName,
            lastName: familyMember.lastName,
            name: fullName(familyMember),
            email: familyMember.email ?? "",
            phone: familyMember.phone ?? "",
            age: familyMember.age,
            relationship: familyMember.relationship,
            allergies: familyMember.allergies ?? "",
            emergencyContactName: familyMember.emergencyContactName ?? "",
            emergencyContactPhone: familyMember.emergencyContactPhone ?? "",
            emergencyContactEmail: familyMember.emergencyContactEmail ?? "",
            notes: familyMember.notes ?? "",
            isPrimary: familyMember.isPrimary,
            status: familyMember.status,
            isCurrentlyIn: familyMember.checkinEvents.length > 0,
            checkedInAt: familyMember.checkinEvents[0]?.checkedInAt.toISOString() ?? null
          })),
        history: person.checkinEvents.map((event) => ({
          eventId: event.id,
          eventType: event.signedOutAt ? "sign_out" : event.eventType,
          checkedInAt: event.checkedInAt.toISOString(),
          signedOutAt: event.signedOutAt?.toISOString() ?? null,
          isActive: event.isActive,
          numGuests: event.numGuests,
          source: event.source
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});
