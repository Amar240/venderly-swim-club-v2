import { prisma } from "../lib/prisma";
import type { GuestPassValidationResult } from "../types";

export const validateGuestPass = async (clubId: string, code: string): Promise<GuestPassValidationResult> => {
  const guestPassPurchase = await prisma.guestPassPurchase.findUnique({
    where: {
      clubId_code: {
        clubId,
        code
      }
    },
    select: {
      id: true,
      quantityPurchased: true,
      quantityUsed: true,
      expiresAt: true
    }
  });

  if (!guestPassPurchase) {
    return { valid: false, reason: "Guest pass was not found" };
  }

  const remainingUses = guestPassPurchase.quantityPurchased - guestPassPurchase.quantityUsed;

  if (remainingUses <= 0) {
    return { valid: false, reason: "Guest pass has no remaining uses", remainingUses: 0 };
  }

  if (guestPassPurchase.expiresAt && guestPassPurchase.expiresAt < new Date()) {
    return { valid: false, reason: "Guest pass is expired", remainingUses };
  }

  return {
    valid: true,
    guestPassPurchaseId: guestPassPurchase.id,
    remainingUses
  };
};
