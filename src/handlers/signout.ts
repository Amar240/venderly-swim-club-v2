import type { RequestHandler } from "express";
import { z } from "zod";
import { lookupMember } from "../services/memberLookup";

const signOutSchema = z.object({
  membershipCode: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(7).optional()
});

export const signOutHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = signOutSchema.parse(req.body);
    const memberLookup = await lookupMember(input);

    res.status(202).json({
      status: "ok",
      data: {
        message: "Sign-out workflow placeholder accepted",
        memberLookup
      }
    });
  } catch (error) {
    next(error);
  }
};
