import type { RequestHandler } from "express";
import bcrypt from "bcrypt";
import { Prisma, type StaffRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getDayBounds, getNewYorkTodayBounds } from "../lib/timezone";
import { HttpError } from "../middleware/errorHandler";
import type { StaffResponse } from "../middleware/jwtAuth";

const createStaffSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().email().toLowerCase(),
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
  role: z.enum(["STAFF", "ADMIN"])
});

const updateStaffSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits").optional(),
  role: z.enum(["STAFF", "ADMIN"]).optional()
});

const staffParamsSchema = z.object({
  id: z.string().min(1)
});

const activityQuerySchema = z.object({
  staffId: z.string().trim().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => {
      const parsed = Number.parseInt(value ?? "100", 10);
      return Number.isNaN(parsed) ? 100 : Math.min(Math.max(parsed, 1), 500);
    })
});

const editActivityQuerySchema = z.object({
  staffId: z.string().trim().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => {
      const parsed = Number.parseInt(value ?? "50", 10);
      return Number.isNaN(parsed) ? 50 : Math.min(Math.max(parsed, 1), 200);
    })
});

type StaffRecord = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  isActive: boolean;
  createdAt: Date;
};

type StaffPinRecord = {
  id: string;
  passwordHash: string;
};

type ActivityCheckin = {
  id: string;
  checkedInAt: Date;
  signedOutAt: Date | null;
  staff: { id: string; name: string } | null;
  person: { firstName: string; lastName: string } | null;
};

export type AdminActivityEvent = {
  eventId: string;
  timestamp: string;
  actionType: "manual_checkin" | "manual_signout";
  staffId: string;
  staffName: string;
  memberName: string;
};

type MemberEditLogRecord = {
  id: string;
  createdAt: Date;
  targetType: string;
  targetLabel: string;
  changes: Prisma.JsonValue;
  staff: { id: string; name: string };
};

export type AdminEditActivityEvent = {
  id: string;
  createdAt: string;
  staff: { id: string; name: string };
  targetType: string;
  targetLabel: string;
  changes: Prisma.JsonValue;
};

const fullName = (person: { firstName: string; lastName: string }): string =>
  `${person.firstName} ${person.lastName}`.trim();

export const serializeStaff = (staff: StaffRecord) => ({
  id: staff.id,
  name: staff.name,
  email: staff.email,
  role: staff.role,
  isActive: staff.isActive,
  createdAt: staff.createdAt.toISOString()
});

export const findActivePinConflict = async (
  pin: string,
  staff: StaffPinRecord[],
  excludeStaffId?: string
): Promise<StaffPinRecord | null> => {
  for (const candidate of staff) {
    if (candidate.id === excludeStaffId) {
      continue;
    }

    if (await bcrypt.compare(pin, candidate.passwordHash)) {
      return candidate;
    }
  }

  return null;
};

export const flattenActivityEvents = (events: ActivityCheckin[]): AdminActivityEvent[] =>
  events
    .flatMap((event): AdminActivityEvent[] => {
      if (!event.staff) {
        return [];
      }

      const memberName = event.person ? fullName(event.person) : "Unknown member";
      const checkinEntry: AdminActivityEvent = {
        eventId: event.id,
        timestamp: event.checkedInAt.toISOString(),
        actionType: "manual_checkin",
        staffId: event.staff.id,
        staffName: event.staff.name,
        memberName
      };

      if (!event.signedOutAt) {
        return [checkinEntry];
      }

      return [
        checkinEntry,
        {
          eventId: event.id,
          timestamp: event.signedOutAt.toISOString(),
          actionType: "manual_signout",
          staffId: event.staff.id,
          staffName: event.staff.name,
          memberName
        }
      ];
    })
    .sort((first, second) => Date.parse(second.timestamp) - Date.parse(first.timestamp));

export const serializeEditActivityEvents = (events: MemberEditLogRecord[]): AdminEditActivityEvent[] =>
  events.map((event) => ({
    id: event.id,
    createdAt: event.createdAt.toISOString(),
    staff: event.staff,
    targetType: event.targetType,
    targetLabel: event.targetLabel,
    changes: event.changes
  }));

const assertNoActivePinConflict = async (clubId: string, pin: string, excludeStaffId?: string): Promise<void> => {
  const activeStaff = await prisma.staff.findMany({
    where: {
      clubId,
      isActive: true
    },
    select: {
      id: true,
      passwordHash: true
    }
  });

  const conflict = await findActivePinConflict(pin, activeStaff, excludeStaffId);

  if (conflict) {
    throw new HttpError(409, "PIN_TAKEN", "PIN is already assigned to another active staff member");
  }
};

const activeAdminCount = (clubId: string): Promise<number> =>
  prisma.staff.count({
    where: {
      clubId,
      role: "ADMIN",
      isActive: true
    }
  });

export const listStaff: RequestHandler = async (_req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const staff = await prisma.staff.findMany({
      where: { clubId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    res.json({ staff: staff.map(serializeStaff) });
  } catch (error) {
    next(error);
  }
};

export const createStaff: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const input = createStaffSchema.parse(req.body);

    await assertNoActivePinConflict(clubId, input.pin);

    const passwordHash = await bcrypt.hash(input.pin, 10);
    const staff = await prisma.staff.create({
      data: {
        clubId,
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    res.status(201).json({ staff: serializeStaff(staff) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      next(new HttpError(409, "EMAIL_TAKEN", "Email is already assigned to another staff member"));
      return;
    }

    next(error);
  }
};

export const updateStaff: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { id } = staffParamsSchema.parse(req.params);
    const input = updateStaffSchema.parse(req.body);
    const target = await prisma.staff.findFirst({
      where: { id, clubId },
      select: {
        id: true,
        role: true,
        isActive: true
      }
    });

    if (!target) {
      throw new HttpError(404, "STAFF_NOT_FOUND", "Staff member was not found");
    }

    if (target.role === "ADMIN" && input.role === "STAFF" && target.isActive) {
      const admins = await activeAdminCount(clubId);

      if (admins <= 1) {
        throw new HttpError(409, "LAST_ADMIN", "Cannot demote the last active admin");
      }
    }

    const data: Prisma.StaffUpdateInput = {};

    if (input.name !== undefined) {
      data.name = input.name;
    }

    if (input.role !== undefined) {
      data.role = input.role;
    }

    if (input.pin !== undefined) {
      await assertNoActivePinConflict(clubId, input.pin, target.id);
      data.passwordHash = await bcrypt.hash(input.pin, 10);
    }

    const staff = await prisma.staff.update({
      where: { id: target.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    res.json({ staff: serializeStaff(staff) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      next(new HttpError(409, "EMAIL_TAKEN", "Email is already assigned to another staff member"));
      return;
    }

    next(error);
  }
};

export const deactivateStaff: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { id } = staffParamsSchema.parse(req.params);
    const target = await prisma.staff.findFirst({
      where: { id, clubId },
      select: {
        id: true,
        role: true,
        isActive: true
      }
    });

    if (!target) {
      throw new HttpError(404, "STAFF_NOT_FOUND", "Staff member was not found");
    }

    if (target.role === "ADMIN" && target.isActive) {
      const admins = await activeAdminCount(clubId);

      if (admins <= 1) {
        throw new HttpError(409, "LAST_ADMIN", "Cannot deactivate the last active admin");
      }
    }

    await prisma.staff.update({
      where: { id: target.id },
      data: { isActive: false }
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const listActivity: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { staffId, date, limit } = activityQuerySchema.parse(req.query);
    const dayBounds = date ? getDayBounds(date) : getNewYorkTodayBounds();
    const events = await prisma.checkinEvent.findMany({
      where: {
        clubId,
        staffId: staffId ?? { not: null },
        OR: [
          {
            checkedInAt: {
              gte: dayBounds.start,
              lt: dayBounds.end
            }
          },
          {
            signedOutAt: {
              gte: dayBounds.start,
              lt: dayBounds.end
            }
          }
        ]
      },
      orderBy: { updatedAt: "desc" },
      take: limit * 2,
      select: {
        id: true,
        checkedInAt: true,
        signedOutAt: true,
        person: {
          select: {
            firstName: true,
            lastName: true
          }
        },
        staff: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.json({ events: flattenActivityEvents(events).slice(0, limit) });
  } catch (error) {
    next(error);
  }
};

export const listEditActivity: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { staffId, date, limit } = editActivityQuerySchema.parse(req.query);
    const dayBounds = date ? getDayBounds(date) : getNewYorkTodayBounds();
    const events = await prisma.memberEditLog.findMany({
      where: {
        clubId,
        ...(staffId ? { staffId } : {}),
        createdAt: {
          gte: dayBounds.start,
          lt: dayBounds.end
        }
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        targetType: true,
        targetLabel: true,
        changes: true,
        staff: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.json({ events: serializeEditActivityEvents(events) });
  } catch (error) {
    next(error);
  }
};
