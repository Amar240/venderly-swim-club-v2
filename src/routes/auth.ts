import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";

const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1).optional(),
    pin: z.string().min(1).optional()
  })
  .refine((value) => value.password || value.pin, {
    message: "Password or PIN is required"
  });

export const authRouter = Router();

authRouter.post("/login", async (req, res, next) => {
  try {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      throw new HttpError(500, "JWT_SECRET_NOT_CONFIGURED", "JWT secret is not configured");
    }

    const { email, password, pin } = loginSchema.parse(req.body);
    const credential = password ?? pin;
    const staff = await prisma.staff.findUnique({
      where: { email },
      select: {
        id: true,
        clubId: true,
        email: true,
        passwordHash: true,
        name: true,
        role: true,
        isActive: true
      }
    });

    if (!staff || !staff.isActive) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const passwordMatches = credential ? await bcrypt.compare(credential, staff.passwordHash) : false;

    if (!passwordMatches) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const token = jwt.sign(
      {
        sub: staff.id,
        clubId: staff.clubId,
        email: staff.email,
        role: staff.role
      },
      jwtSecret,
      { expiresIn: "8h" }
    );

    res.json({
      status: "ok",
      data: {
        token,
        staff: {
          id: staff.id,
          clubId: staff.clubId,
          email: staff.email,
          name: staff.name,
          role: staff.role
        }
      }
    });
  } catch (error) {
    next(error);
  }
});
