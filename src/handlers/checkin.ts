import type { RequestHandler } from "express";
import { z } from "zod";
import { checkPoolCapacity } from "../services/capacity";
import { validateGuestPass } from "../services/guestPass";
import { lookupMember } from "../services/memberLookup";

const checkInSchema = z.object({
  membershipCode: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  guestPassCode: z.string().min(1).optional()
});

export const checkInHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = checkInSchema.parse(req.body);
    const memberLookup = await lookupMember(input);
    const capacity = await checkPoolCapacity();
    const guestPass = input.guestPassCode ? await validateGuestPass(input.guestPassCode) : undefined;

    res.status(202).json({
      status: "ok",
      data: {
        message: "Check-in workflow placeholder accepted",
        memberLookup,
        capacity,
        guestPass
      }
    });
  } catch (error) {
    next(error);
  }
};
