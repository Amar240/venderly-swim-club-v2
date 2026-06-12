import type { RequestHandler } from "express";
import { WebhookEventStatus } from "@prisma/client";
import { z } from "zod";
import { checkInHandler } from "./checkin";
import { guestPassPurchaseHandler } from "./guestPassPurchase";
import { signOutHandler } from "./signout";
import { signupHandler } from "./signup";
import { prisma } from "../lib/prisma";
import {
  buildWebhookPayloadPreview,
  replayWebhookEvent,
  WEBHOOK_ENDPOINTS,
  type WebhookEndpoint
} from "../lib/webhookEventLog";
import { HttpError } from "../middleware/errorHandler";
import type { StaffResponse } from "../middleware/jwtAuth";

const webhookStatusSchema = z.enum(["RECEIVED", "PROCESSED", "FAILED"]);
const webhookEndpointSchema = z.enum(WEBHOOK_ENDPOINTS);

const listWebhooksQuerySchema = z.object({
  status: webhookStatusSchema.optional(),
  endpoint: webhookEndpointSchema.optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => {
      const parsed = Number.parseInt(value ?? "50", 10);
      return Number.isNaN(parsed) ? 50 : Math.min(Math.max(parsed, 1), 200);
    })
});

const webhookParamsSchema = z.object({
  id: z.string().min(1)
});

const webhookHandlers: Record<WebhookEndpoint, RequestHandler> = {
  signup: signupHandler,
  checkin: checkInHandler,
  signout: signOutHandler,
  guestpass: guestPassPurchaseHandler
};

const serializeWebhookEvent = (event: {
  id: string;
  endpoint: string;
  status: WebhookEventStatus;
  errorMessage: string | null;
  replayOfId: string | null;
  receivedAt: Date;
  processedAt: Date | null;
  rawPayload: unknown;
}) => ({
  id: event.id,
  endpoint: event.endpoint,
  status: event.status,
  errorMessage: event.errorMessage,
  replayOfId: event.replayOfId,
  receivedAt: event.receivedAt.toISOString(),
  processedAt: event.processedAt?.toISOString() ?? null,
  payloadPreview: buildWebhookPayloadPreview(event.rawPayload)
});

export const listWebhookEvents: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { status, endpoint, limit } = listWebhooksQuerySchema.parse(req.query);
    const events = await prisma.webhookEvent.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(endpoint ? { endpoint } : {}),
        OR: [{ clubId }, { clubId: null }]
      },
      orderBy: { receivedAt: "desc" },
      take: limit,
      select: {
        id: true,
        endpoint: true,
        status: true,
        errorMessage: true,
        replayOfId: true,
        receivedAt: true,
        processedAt: true,
        rawPayload: true
      }
    });

    res.json({ events: events.map(serializeWebhookEvent) });
  } catch (error) {
    next(error);
  }
};

export const getWebhookEvent: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { id } = webhookParamsSchema.parse(req.params);
    const event = await prisma.webhookEvent.findFirst({
      where: {
        id,
        OR: [{ clubId }, { clubId: null }]
      },
      select: {
        id: true,
        endpoint: true,
        status: true,
        errorMessage: true,
        replayOfId: true,
        receivedAt: true,
        processedAt: true,
        rawPayload: true
      }
    });

    if (!event) {
      throw new HttpError(404, "WEBHOOK_EVENT_NOT_FOUND", "Webhook event was not found");
    }

    res.json({
      event: {
        ...serializeWebhookEvent(event),
        rawPayload: event.rawPayload
      }
    });
  } catch (error) {
    next(error);
  }
};

export const replayWebhookEventHandler: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { id } = webhookParamsSchema.parse(req.params);
    const event = await prisma.webhookEvent.findFirst({
      where: {
        id,
        OR: [{ clubId }, { clubId: null }]
      },
      select: {
        id: true,
        endpoint: true,
        status: true,
        rawPayload: true
      }
    });

    if (!event) {
      throw new HttpError(404, "WEBHOOK_EVENT_NOT_FOUND", "Webhook event was not found");
    }

    if (event.status !== "FAILED") {
      throw new HttpError(409, "WEBHOOK_NOT_FAILED", "Only failed webhook events can be replayed");
    }

    const endpoint = webhookEndpointSchema.parse(event.endpoint);
    const result = await replayWebhookEvent(endpoint, event.rawPayload, webhookHandlers[endpoint], event.id);

    res.json({
      replayedEventId: result.eventId,
      status: result.status,
      statusCode: result.statusCode
    });
  } catch (error) {
    next(error);
  }
};
