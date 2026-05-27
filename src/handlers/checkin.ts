import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { resolveClubIdFromGhlPayload } from "../services/clubResolver";
import { checkPoolCapacity } from "../services/capacity";
import { validateGuestPass } from "../services/guestPass";
import { lookupPerson } from "../services/personLookup";
import type { AuthenticatedStaff } from "../types";

const checkInSchema = z.object({
  personId: z.string().min(1).optional(),
  membershipCode: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  guestPassCode: z.string().min(1).optional(),
  notes: z.string().min(1).optional()
});

export const checkInHandler: RequestHandler = async (req, res, next) => {
  try {
    const staff = res.locals.staff as AuthenticatedStaff | undefined;
    const clubId = staff?.clubId ?? (await resolveClubIdFromGhlPayload(req.body));
    const input = checkInSchema.parse(req.body);
    const personLookup = await lookupPerson({ ...input, clubId });

    if (personLookup.ambiguous) {
      throw new HttpError(409, "PERSON_LOOKUP_AMBIGUOUS", "Person lookup matched multiple active people");
    }

    if (!personLookup.found || !personLookup.personId) {
      throw new HttpError(404, "PERSON_NOT_FOUND", "No active person matched the check-in request");
    }

    const personId = personLookup.personId;

    const existingCheckin = await prisma.checkinEvent.findFirst({
      where: {
        clubId,
        personId,
        isActive: true
      },
      select: { id: true }
    });

    if (existingCheckin) {
      throw new HttpError(409, "ALREADY_CHECKED_IN", "Person already has an active check-in");
    }

    const capacity = await checkPoolCapacity(clubId);

    if (!capacity.allowed) {
      throw new HttpError(409, "POOL_AT_CAPACITY", "Pool is at capacity");
    }

    const guestPass = input.guestPassCode ? await validateGuestPass(clubId, input.guestPassCode) : undefined;

    if (guestPass && !guestPass.valid) {
      throw new HttpError(400, "INVALID_GUEST_PASS", guestPass.reason ?? "Guest pass is invalid");
    }

    const checkinEvent = await prisma.$transaction(async (transaction) => {
      if (guestPass?.guestPassPurchaseId) {
        const updateResult = await transaction.guestPassPurchase.updateMany({
          where: {
            id: guestPass.guestPassPurchaseId,
            clubId,
            quantityUsed: { lt: prisma.guestPassPurchase.fields.quantityPurchased }
          },
          data: {
            quantityUsed: { increment: 1 }
          }
        });

        if (updateResult.count !== 1) {
          throw new HttpError(409, "GUEST_PASS_EXHAUSTED", "Guest pass no longer has remaining uses");
        }
      }

      return transaction.checkinEvent.create({
        data: {
          clubId,
          personId,
          membershipId: personLookup.membershipId,
          guestPassPurchaseId: guestPass?.guestPassPurchaseId,
          staffId: staff?.id,
          notes: input.notes
        },
        select: {
          id: true,
          clubId: true,
          personId: true,
          membershipId: true,
          guestPassPurchaseId: true,
          isActive: true,
          checkedInAt: true
        }
      });
    });

    res.status(202).json({
      status: "ok",
      data: {
        message: "Check-in accepted",
        checkinEvent,
        personLookup,
        capacity,
        guestPass
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      next(new HttpError(409, "ALREADY_CHECKED_IN", "Person already has an active check-in"));
      return;
    }

    next(error);
  }
};
