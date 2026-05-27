import type { RequestHandler } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { resolveClubIdFromGhlPayload } from "../services/clubResolver";
import { lookupPerson } from "../services/personLookup";
import type { AuthenticatedStaff } from "../types";

const signOutSchema = z.object({
  personId: z.string().min(1).optional(),
  membershipCode: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  notes: z.string().min(1).optional()
});

export const signOutHandler: RequestHandler = async (req, res, next) => {
  try {
    const staff = res.locals.staff as AuthenticatedStaff | undefined;
    const clubId = staff?.clubId ?? (await resolveClubIdFromGhlPayload(req.body));
    const input = signOutSchema.parse(req.body);
    const personLookup = await lookupPerson({ ...input, clubId });

    if (personLookup.ambiguous) {
      throw new HttpError(409, "PERSON_LOOKUP_AMBIGUOUS", "Person lookup matched multiple active people");
    }

    if (!personLookup.found || !personLookup.personId) {
      throw new HttpError(404, "PERSON_NOT_FOUND", "No active person matched the sign-out request");
    }

    const activeCheckin = await prisma.checkinEvent.findFirst({
      where: {
        clubId,
        personId: personLookup.personId,
        isActive: true
      },
      select: { id: true }
    });

    if (!activeCheckin) {
      throw new HttpError(404, "ACTIVE_CHECKIN_NOT_FOUND", "No active check-in was found for this person");
    }

    const checkinEvent = await prisma.checkinEvent.update({
      where: { id: activeCheckin.id },
      data: {
        isActive: false,
        signedOutAt: new Date(),
        notes: input.notes
      },
      select: {
        id: true,
        clubId: true,
        personId: true,
        isActive: true,
        checkedInAt: true,
        signedOutAt: true
      }
    });

    res.status(202).json({
      status: "ok",
      data: {
        message: "Sign-out accepted",
        checkinEvent,
        personLookup
      }
    });
  } catch (error) {
    next(error);
  }
};
