import { Router } from "express";
import { z } from "zod";
import { checkInHandler } from "../handlers/checkin";
import { signOutHandler } from "../handlers/signout";
import { signupHandler } from "../handlers/signup";
import { webhookAuth } from "../middleware/webhookAuth";
import type { GhlWebhookPayload } from "../types";

const ghlWebhookSchema = z.object({
  eventType: z.string().optional(),
  contactId: z.string().optional()
}).passthrough();

export const webhooksRouter = Router();

webhooksRouter.use(webhookAuth);

webhooksRouter.post("/ghl/checkin", checkInHandler);
webhooksRouter.post("/ghl/signout", signOutHandler);
webhooksRouter.post("/ghl/signup", signupHandler);

webhooksRouter.post("/ghl", (req, res, next) => {
  try {
    const parsedPayload = ghlWebhookSchema.parse(req.body);
    const payload: GhlWebhookPayload = {
      eventType: parsedPayload.eventType,
      contactId: parsedPayload.contactId,
      payload: parsedPayload
    };

    res.status(202).json({
      status: "ok",
      data: {
        message: "GHL webhook placeholder accepted",
        payload
      }
    });
  } catch (error) {
    next(error);
  }
});
