import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { PASSES_PER_PACK } from "../lib/guestPasses";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";

const quantitySchema = z.union([z.number(), z.string()]).transform((value, context) => {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "quantity invalid"
    });
    return z.NEVER;
  }

  return Math.min(parsed, 50);
});

const guestPassPurchaseSchema = z
  .object({
    location: z
      .object({
        id: z.string().min(1)
      })
      .passthrough(),
    contact_id: z.string().min(1),
    order_id: z.string().min(1),
    quantity: quantitySchema,
    amount: z.union([z.number(), z.string()]).optional()
  })
  .passthrough();

export const guestPassPurchaseHandler: RequestHandler = async (req, res, next) => {
  try {
    const expectedSecret = process.env.WEBHOOK_SECRET;
    const providedSecret = req.header("X-Webhook-Secret");

    if (!expectedSecret || providedSecret !== expectedSecret) {
      throw new HttpError(401, "INVALID_WEBHOOK_SECRET", "Invalid webhook secret");
    }

    const input = guestPassPurchaseSchema.parse(req.body);
    const club = await prisma.club.findFirst({
      where: {
        ghlLocationId: input.location.id,
        isActive: true
      },
      select: { id: true }
    });

    if (!club) {
      throw new HttpError(422, "CLUB_NOT_FOUND", "No active club matches the GHL location id");
    }

    const membership = await prisma.membership.findFirst({
      where: {
        clubId: club.id,
        ghlContactId: input.contact_id
      },
      select: {
        id: true,
        guestPassesTotal: true
      }
    });

    if (!membership) {
      throw new HttpError(422, "MEMBERSHIP_NOT_FOUND", "No membership matches that contact");
    }

    const passesToAdd = input.quantity * PASSES_PER_PACK;

    try {
      const result = await prisma.$transaction(async (transaction) => {
        const purchase = await transaction.guestPassPurchase.create({
          data: {
            clubId: club.id,
            membershipId: membership.id,
            code: input.order_id,
            quantityPurchased: input.quantity,
            quantityUsed: 0
          },
          select: { id: true }
        });
        const updated = await transaction.membership.update({
          where: { id: membership.id },
          data: {
            guestPassesTotal: {
              increment: passesToAdd
            }
          },
          select: { guestPassesTotal: true }
        });

        return {
          purchaseId: purchase.id,
          newTotal: updated.guestPassesTotal
        };
      });

      res.status(200).json({
        success: true,
        message: `Added ${passesToAdd} guest passes`,
        membershipId: membership.id,
        passesAdded: passesToAdd,
        newGuestPassesTotal: result.newTotal,
        purchaseId: result.purchaseId
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        logger.info("Duplicate guest-pass webhook ignored", { orderId: input.order_id });
        res.status(200).json({
          success: true,
          message: "Order already processed",
          membershipId: membership.id,
          duplicate: true
        });
        return;
      }

      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown guest-pass webhook error";
    logger.error("Guest-pass webhook failed", { message });
    next(error);
  }
};
