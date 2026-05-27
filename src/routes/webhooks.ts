import { Router } from "express";
import { z } from "zod";
import { checkInHandler } from "../handlers/checkin";
import { signOutHandler } from "../handlers/signout";
import { signupHandler } from "../handlers/signup";
import { webhookAuth } from "../middleware/webhookAuth";
import { resolveClubIdFromGhlPayload } from "../services/clubResolver";
import type { GhlWebhookPayload } from "../types";

const ghlWebhookSchema = z.object({
  eventType: z.string().optional(),
  contactId: z.string().optional()
}).passthrough();

export const webhooksRouter = Router();

// TEMPORARY - remove before production
webhooksRouter.post("/debug", (req, res) => {
  console.log(JSON.stringify(req.body, null, 2));
  console.log(req.headers);

  res.status(200).json({
    received: true,
    timestamp: new Date().toISOString(),
    body_keys: Object.keys(req.body),
    body: req.body
  });
});

webhooksRouter.post("/ghl/signup", signupHandler);

webhooksRouter.use(webhookAuth);

webhooksRouter.post("/ghl/checkin", checkInHandler);
webhooksRouter.post("/ghl/signout", signOutHandler);

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
