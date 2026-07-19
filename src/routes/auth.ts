import { Router, type Request } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { isDemoStaffEmail } from "./demoAdminSession";
import { signStaffToken } from "../lib/staffTokens";

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
    const { pin } = loginSchema.parse(req.body);
    const attemptKey = getLoginAttemptKey(req);
    const now = Date.now();

    if (isRateLimited(attemptKey, now)) {
      throw new HttpError(429, "TOO_MANY_ATTEMPTS", "Too many failed PIN attempts. Please try again later.");
    }

    // PIN login scans active staff of all active clubs (multi-club ready);
    // the issued JWT carries the matched staff member's own clubId.
    const activeStaff = await prisma.staff.findMany({
      where: {
        isActive: true,
        club: { isActive: true }
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

    const demoProspect = isDemoStaffEmail(staff.email)
      ? await prisma.prospect.findFirst({
          where: { clubId: staff.clubId, expiresAt: { gt: new Date() } },
          select: { expiresAt: true }
        })
      : null;
    const demoAdmin = Boolean(demoProspect);
    const signed = signStaffToken(staff, {
      demoAdmin,
      expiresAt: demoProspect?.expiresAt,
      maxLifetimeSeconds: 8 * 60 * 60
    });

    res.json({
      status: "ok",
      data: {
        token: signed.token,
        staff: {
          id: staff.id,
          clubId: staff.clubId,
          email: staff.email,
          name: staff.name,
          role: staff.role,
          ...(demoAdmin ? { demoAdmin: true } : {})
        }
      }
    });
  } catch (error) {
    next(error);
  }
});
