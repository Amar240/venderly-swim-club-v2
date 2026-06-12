import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Prisma } from "@prisma/client";
import { logger } from "./logger";
import { prisma } from "./prisma";

export const WEBHOOK_ENDPOINTS = ["signup", "checkin", "signout", "guestpass"] as const;

export type WebhookEndpoint = (typeof WEBHOOK_ENDPOINTS)[number];
export type WebhookProcessingStatus = "PROCESSED" | "FAILED";

type ReplayResult = {
  eventId: string;
  status: WebhookProcessingStatus;
  statusCode: number;
  body: unknown;
  errorMessage?: string;
};

const MAX_ERROR_LENGTH = 500;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

export const trimErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown webhook error");
  return message.slice(0, MAX_ERROR_LENGTH);
};

export const toJsonPayload = (payload: unknown): Prisma.InputJsonValue => {
  try {
    return JSON.parse(JSON.stringify(payload ?? {})) as Prisma.InputJsonValue;
  } catch {
    return {} as Prisma.InputJsonValue;
  }
};

export const getWebhookLocationId = (payload: unknown): string | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }

  const location = payload.location;

  if (isRecord(location)) {
    const nested = getString(location.id);

    if (nested) {
      return nested;
    }
  }

  return getString(payload.location_id);
};

export const resolveWebhookClubId = async (payload: unknown): Promise<string | null> => {
  const locationId = getWebhookLocationId(payload);

  if (!locationId) {
    return null;
  }

  try {
    const club = await prisma.club.findFirst({
      where: {
        ghlLocationId: locationId,
        isActive: true
      },
      select: { id: true }
    });

    return club?.id ?? null;
  } catch (error) {
    logger.error("Failed to resolve webhook club", { message: trimErrorMessage(error) });
    return null;
  }
};

/** Friendly member name for the admin list: name, then email, then a dash. */
export const extractWebhookMemberName = (payload: unknown): string => {
  if (!isRecord(payload)) {
    return "—";
  }

  const name = [getString(payload.first_name), getString(payload.last_name)].filter(Boolean).join(" ");

  if (name) {
    return name;
  }

  return getString(payload.email) ?? "—";
};

const createReceivedEvent = async (
  endpoint: WebhookEndpoint,
  payload: unknown,
  replayOfId?: string
): Promise<string | null> => {
  try {
    const clubId = await resolveWebhookClubId(payload);
    const event = await prisma.webhookEvent.create({
      data: {
        clubId,
        endpoint,
        rawPayload: toJsonPayload(payload),
        replayOfId
      },
      select: { id: true }
    });

    return event.id;
  } catch (error) {
    logger.error("Failed to create webhook event log row", {
      endpoint,
      message: trimErrorMessage(error)
    });
    return null;
  }
};

const markProcessed = async (eventId: string | null, payload: unknown): Promise<void> => {
  if (!eventId) {
    return;
  }

  try {
    // updateMany: a no-op (not an error) if the row no longer exists,
    // e.g. pruned/truncated between receipt and completion.
    await prisma.webhookEvent.updateMany({
      where: { id: eventId },
      data: {
        clubId: await resolveWebhookClubId(payload),
        status: "PROCESSED",
        errorMessage: null,
        processedAt: new Date()
      }
    });
  } catch (error) {
    logger.error("Failed to mark webhook event processed", {
      eventId,
      message: trimErrorMessage(error)
    });
  }
};

const markFailed = async (eventId: string | null, payload: unknown, error: unknown): Promise<void> => {
  if (!eventId) {
    return;
  }

  try {
    await prisma.webhookEvent.updateMany({
      where: { id: eventId },
      data: {
        clubId: await resolveWebhookClubId(payload),
        status: "FAILED",
        errorMessage: trimErrorMessage(error),
        processedAt: new Date()
      }
    });
  } catch (updateError) {
    logger.error("Failed to mark webhook event failed", {
      eventId,
      message: trimErrorMessage(updateError)
    });
  }
};

export const withWebhookLog = (endpoint: WebhookEndpoint, handler: RequestHandler): RequestHandler => {
  return async (req, res, next) => {
    const eventId = await createReceivedEvent(endpoint, req.body);
    let completed = false;

    const completeProcessed = async (): Promise<void> => {
      if (completed) {
        return;
      }

      completed = true;
      await markProcessed(eventId, req.body);
    };

    const completeFailed = async (error: unknown): Promise<void> => {
      if (completed) {
        return;
      }

      completed = true;
      await markFailed(eventId, req.body, error);
    };

    res.once("finish", () => {
      if (completed) {
        return;
      }

      if (res.statusCode < 400) {
        void completeProcessed();
        return;
      }

      void completeFailed(new Error(`Webhook response status ${res.statusCode}`));
    });

    const wrappedNext: NextFunction = (error?: unknown) => {
      if (!error) {
        next();
        return;
      }

      void completeFailed(error).finally(() => next(error));
    };

    try {
      await Promise.resolve(handler(req, res, wrappedNext));
    } catch (error) {
      await completeFailed(error);
      next(error);
    }
  };
};

const isBenignCheckinReplayFailure = (endpoint: WebhookEndpoint, statusCode: number, body: unknown): boolean => {
  if (endpoint !== "checkin") {
    return false;
  }

  if (isRecord(body) && body.code === "ALREADY_CHECKED_IN") {
    return true;
  }

  return statusCode === 409;
};

export const replayWebhookEvent = async (
  endpoint: WebhookEndpoint,
  payload: unknown,
  handler: RequestHandler,
  replayOfId: string
): Promise<ReplayResult> => {
  const eventId = await createReceivedEvent(endpoint, payload, replayOfId);
  let statusCode = 200;
  let body: unknown;
  let sent = false;
  let nextError: unknown;

  const req = {
    body: payload,
    header: (name: string) =>
      name.toLowerCase() === "x-webhook-secret" ? process.env.WEBHOOK_SECRET : undefined
  } as Request;

  const resMock = {
    statusCode,
    headersSent: false,
    status(code: number) {
      statusCode = code;
      resMock.statusCode = code;
      return resMock;
    },
    json(data: unknown) {
      body = data;
      sent = true;
      resMock.headersSent = true;
      return resMock;
    },
    send(data?: unknown) {
      body = data;
      sent = true;
      resMock.headersSent = true;
      return resMock;
    }
  };
  const res = resMock as unknown as Response;

  const next: NextFunction = (error?: unknown) => {
    nextError = error;
  };

  try {
    await Promise.resolve(handler(req, res, next));

    if (nextError) {
      throw nextError;
    }

    const benign = isBenignCheckinReplayFailure(endpoint, statusCode, body);

    if ((sent && statusCode < 400) || benign) {
      await markProcessed(eventId, payload);
      return {
        eventId: eventId ?? "",
        status: "PROCESSED",
        statusCode,
        body
      };
    }

    const message = `Webhook replay response status ${statusCode}`;
    await markFailed(eventId, payload, new Error(message));
    return {
      eventId: eventId ?? "",
      status: "FAILED",
      statusCode,
      body,
      errorMessage: message
    };
  } catch (error) {
    await markFailed(eventId, payload, error);
    return {
      eventId: eventId ?? "",
      status: "FAILED",
      statusCode,
      body,
      errorMessage: trimErrorMessage(error)
    };
  }
};
