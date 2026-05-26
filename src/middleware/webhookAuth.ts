import type { RequestHandler } from "express";
import { HttpError } from "./errorHandler";

export const webhookAuth: RequestHandler = (req, _res, next) => {
  const expectedSecret = process.env.WEBHOOK_SECRET;

  if (!expectedSecret) {
    next(new HttpError(500, "WEBHOOK_SECRET_NOT_CONFIGURED", "Webhook secret is not configured"));
    return;
  }

  const providedSecret = req.header("X-Webhook-Secret");

  if (!providedSecret || providedSecret !== expectedSecret) {
    next(new HttpError(401, "INVALID_WEBHOOK_SECRET", "Invalid webhook secret"));
    return;
  }

  next();
};
