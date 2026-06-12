import { Router, type Request } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";

const WEDGEWOOD_CLUB_ID = "9dd5014c-8c15-4959-869c-2f61dc80c8af";
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

const loginSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits")
});

const getLoginAttemptKey = (req: Request): string => req.ip || req.socket.remoteAddress || "unknown";

const isRateLimited = (key: string, now: number): boolean => {
  const attempts = loginAttempts.get(key);

  if (!attempts) {
    return false;
  }

  if (attempts.resetAt <= now) {
    loginAttempts.delete(key);
    return false;
  }

  return attempts.count >= MAX_FAILED_LOGIN_ATTEMPTS;
};

const recordFailedLogin = (key: string, now: number): void => {
  const attempts = loginAttempts.get(key);

  if (!attempts || attempts.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_ATTEMPT_WINDOW_MS });
    return;
  }

  loginAttempts.set(key, { count: attempts.count + 1, resetAt: attempts.resetAt });
};

export const authRouter = Router();

authRouter.post("/login", async (req, res, next) => {
  try {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      throw new HttpError(500, "JWT_SECRET_NOT_CONFIGURED", "JWT secret is not configured");
    }

    const { pin } = loginSchema.parse(req.body);
    const attemptKey = getLoginAttemptKey(req);
    const now = Date.now();

    if (isRateLimited(attemptKey, now)) {
      throw new HttpError(429, "TOO_MANY_ATTEMPTS", "Too many failed PIN attempts. Please try again later.");
    }

    const activeStaff = await prisma.staff.findMany({
      where: {
        clubId: WEDGEWOOD_CLUB_ID,
        isActive: true
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        clubId: true,
        email: true,
        passwordHash: true,
        name: true,
        role: true
      }
    });

    let staff = null;

    for (const candidate of activeStaff) {
      if (await bcrypt.compare(pin, candidate.passwordHash)) {
        staff = candidate;
        break;
      }
    }

    if (!staff) {
      recordFailedLogin(attemptKey, now);
      throw new HttpError(401, "INVALID_PIN", "Invalid PIN");
    }

    loginAttempts.delete(attemptKey);

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
