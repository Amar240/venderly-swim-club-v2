import { Router } from "express";
import { z } from "zod";
import { checkInHandler } from "../handlers/checkin";
import { guestPassPurchaseHandler } from "../handlers/guestPassPurchase";
import { signOutHandler } from "../handlers/signout";
import { signupHandler } from "../handlers/signup";
import { withWebhookLog } from "../lib/webhookEventLog";
import { webhookAuth } from "../middleware/webhookAuth";
import { resolveClubIdFromGhlPayload } from "../services/clubResolver";
import type { GhlWebhookPayload } from "../types";

const ghlWebhookSchema = z.object({
  eventType: z.string().optional(),
  contactId: z.string().optional()
}).passthrough();

export const webhooksRouter = Router();

webhooksRouter.use(webhookAuth);

webhooksRouter.post("/ghl/signup", withWebhookLog("signup", signupHandler));
webhooksRouter.post("/ghl/checkin", withWebhookLog("checkin", checkInHandler));
webhooksRouter.post("/ghl/signout", withWebhookLog("signout", signOutHandler));
webhooksRouter.post("/ghl/guestpass", withWebhookLog("guestpass", guestPassPurchaseHandler));

webhooksRouter.post("/ghl", async (req, res, next) => {
  try {
    const parsedPayload = ghlWebhookSchema.parse(req.body);
    const clubId = await resolveClubIdFromGhlPayload(parsedPayload);
    const payload: GhlWebhookPayload = {
      eventType: parsedPayload.eventType,
      contactId: parsedPayload.contactId,
      payload: parsedPayload
    };

    res.status(202).json({
      status: "ok",
      data: {
        message: "GHL webhook placeholder accepted",
        clubId,
        payload
      }
    });
  } catch (error) {
    next(error);
  }
});
