import { GuestPassStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { GuestPassValidationResult } from "../types";

export const validateGuestPass = async (code: string): Promise<GuestPassValidationResult> => {
  const guestPass = await prisma.guestPass.findUnique({
    where: { code },
    select: {
      id: true,
      status: true,
      expiresAt: true
    }
  });

  if (!guestPass) {
    return { valid: false, reason: "Guest pass was not found" };
  }

  if (guestPass.status !== GuestPassStatus.AVAILABLE) {
    return { valid: false, reason: `Guest pass is ${guestPass.status.toLowerCase()}` };
  }

  if (guestPass.expiresAt && guestPass.expiresAt < new Date()) {
    return { valid: false, reason: "Guest pass is expired" };
  }

  return { valid: true, guestPassId: guestPass.id };
};
