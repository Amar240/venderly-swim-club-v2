import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { PASSES_PER_PACK } from "../lib/guestPasses";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";

const PACK_PRICE_DOLLARS = 50;

const guestPassPurchaseSchema = z
  .object({
    location: z
      .object({
        id: z.string().min(1)
      })
      .passthrough(),
    contact_id: z.string().min(1),
    order_id: z.string().optional(),
    quantity: z.union([z.number(), z.string()]).optional(),
    amount: z
      .union([z.number(), z.string(), z.null()])
      .optional()
      .transform((value) => {
        if (value === undefined || value === "" || value === null) {
          return undefined;
        }

        const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
      })
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

    const amount = input.amount;
    const amountInDollars =
      amount !== undefined && amount < 1000 ? amount : amount !== undefined ? amount / 100 : undefined;
    const explicit =
      typeof input.quantity === "number"
        ? input.quantity
        : typeof input.quantity === "string" && input.quantity.trim() !== ""
          ? Number.parseInt(input.quantity, 10)
          : undefined;
    const derived = amountInDollars !== undefined ? Math.round(amountInDollars / PACK_PRICE_DOLLARS) : undefined;
    const quantity = (explicit && explicit > 0 ? explicit : derived) ?? 0;

    if (quantity < 1) {
      throw new HttpError(
        422,
        "QUANTITY_REQUIRED",
        "Could not determine pack quantity from order_id, quantity, or amount. Please see staff."
      );
    }

    const cappedQuantity = Math.min(quantity, 50);
    const trimmedOrder = input.order_id?.trim();
    const orderId =
      trimmedOrder && trimmedOrder.length > 0
        ? trimmedOrder
        : `fallback-${input.contact_id}-${amount ?? "noamt"}-${cappedQuantity}`;
    const passesToAdd = cappedQuantity * PASSES_PER_PACK;

    try {
      const result = await prisma.$transaction(async (transaction) => {
        const purchase = await transaction.guestPassPurchase.create({
          data: {
            clubId: club.id,
            membershipId: membership.id,
            code: orderId,
            quantityPurchased: cappedQuantity,
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
        logger.info("Duplicate guest-pass webhook ignored", { orderId });
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
