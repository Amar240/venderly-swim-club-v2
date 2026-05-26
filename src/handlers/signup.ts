import type { RequestHandler } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const signupSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(7).optional()
});

export const signupHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = signupSchema.parse(req.body);
    const signupRequest = await prisma.signupRequest.create({
      data: input,
      select: {
        id: true,
        status: true,
        createdAt: true
      }
    });

    res.status(201).json({
      status: "ok",
      data: {
        message: "Signup request received",
        signupRequest
      }
    });
  } catch (error) {
    next(error);
  }
};
