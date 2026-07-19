import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getActiveDemoProspect } from "../lib/demoAccess";
import { prisma } from "../lib/prisma";
import { generateUniqueStaffPin } from "../lib/staffPins";
import { signStaffToken } from "../lib/staffTokens";
import { HttpError } from "../middleware/errorHandler";
import { createDemoRateLimit } from "../middleware/demoRateLimit";

const paramsSchema = z.object({ clubId: z.string().uuid() });
const bodySchema = z.object({ prospectId: z.string().uuid() });
const sessionRateLimit = createDemoRateLimit({ max: 20, windowMs: 60 * 60 * 1000 });

const splitEmail = (email: string): { local: string; domain: string } => {
  const separator = email.lastIndexOf("@");
  if (separator <= 0 || separator === email.length - 1) {
    throw new HttpError(400, "INVALID_PROSPECT_EMAIL", "The demo contact email is invalid");
  }
  return { local: email.slice(0, separator), domain: email.slice(separator + 1) };
};

export const demoStaffEmailCandidates = (email: string, clubId: string): string[] => {
  const { local, domain } = splitEmail(email);
  const compactClubId = clubId.replaceAll("-", "").toLowerCase();
  return [
    `${local}+demo-${compactClubId.slice(0, 12)}@${domain}`,
    `${local}+demo-${compactClubId}@${domain}`
  ];
};

export const isDemoStaffEmail = (email: string): boolean => /\+demo-[a-f0-9]{12,}@/i.test(email);

export const demoAdminSessionRouter = Router();

demoAdminSessionRouter.get("/capabilities", (_req, res) => {
  res.json({ fullAdmin: true });
});

demoAdminSessionRouter.post("/:clubId/admin-session", sessionRateLimit, async (req, res, next) => {
  try {
    const { clubId } = paramsSchema.parse(req.params);
    const { prospectId } = bodySchema.parse(req.body);
    const { prospect } = await getActiveDemoProspect(clubId, prospectId);
    const emailCandidates = demoStaffEmailCandidates(prospect.email, clubId);

    let staff = await prisma.staff.findFirst({
      where: { clubId, email: { in: emailCandidates }, isActive: true },
      select: { id: true, clubId: true, email: true, name: true, role: true }
    });
    let tempPin: string | null = null;

    if (!staff) {
      const generated = await generateUniqueStaffPin();
      for (const email of emailCandidates) {
        try {
          staff = await prisma.staff.create({
            data: {
              clubId,
              email,
              name: prospect.contactName,
              passwordHash: generated.passwordHash,
              role: "ADMIN",
              isActive: true
            },
            select: { id: true, clubId: true, email: true, name: true, role: true }
          });
          tempPin = generated.pin;
          break;
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
            throw error;
          }

          const concurrent = await prisma.staff.findFirst({
            where: { clubId, email, isActive: true },
            select: { id: true, clubId: true, email: true, name: true, role: true }
          });
          if (concurrent) {
            staff = concurrent;
            break;
          }
        }
      }
    }

    if (!staff) {
      throw new HttpError(409, "DEMO_STAFF_EMAIL_TAKEN", "A unique demo staff email could not be created");
    }

    const signed = signStaffToken(staff, {
      demoAdmin: true,
      expiresAt: prospect.expiresAt,
      maxLifetimeSeconds: 24 * 60 * 60
    });

    res.status(tempPin ? 201 : 200).json({
      token: signed.token,
      staffEmail: staff.email,
      tempPin,
      expiresAt: signed.expiresAt.toISOString(),
      alreadyCreated: tempPin === null,
      staff: {
        ...staff,
        role: "ADMIN",
        demoAdmin: true
      }
    });
  } catch (error) {
    next(error);
  }
});
