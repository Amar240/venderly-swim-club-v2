import type { NextFunction, Request } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../src/middleware/errorHandler";
import { webhookAuth } from "../../src/middleware/webhookAuth";

const makeReq = (secret?: string): Request =>
  ({
    header: vi.fn((name: string) => (name === "X-Webhook-Secret" ? secret : undefined))
  }) as unknown as Request;

describe("webhookAuth", () => {
  const originalWebhookSecret = process.env.WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.WEBHOOK_SECRET = "webhook-secret";
  });

  afterEach(() => {
    process.env.WEBHOOK_SECRET = originalWebhookSecret;
    vi.restoreAllMocks();
  });

  it("calls next for a valid webhook secret", () => {
    const next: NextFunction = vi.fn();

    webhookAuth(makeReq("webhook-secret"), {} as never, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("returns 401 when the header is missing", () => {
    const next: NextFunction = vi.fn();

    webhookAuth(makeReq(), {} as never, next);

    const error = vi.mocked(next).mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 401, code: "INVALID_WEBHOOK_SECRET" });
  });

  it("returns 401 when the secret is wrong", () => {
    const next: NextFunction = vi.fn();

    webhookAuth(makeReq("wrong"), {} as never, next);

    const error = vi.mocked(next).mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 401, code: "INVALID_WEBHOOK_SECRET" });
  });

  it("returns 500 when WEBHOOK_SECRET is missing", () => {
    delete process.env.WEBHOOK_SECRET;
    const next: NextFunction = vi.fn();

    webhookAuth(makeReq("webhook-secret"), {} as never, next);

    const error = vi.mocked(next).mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 500, code: "WEBHOOK_SECRET_NOT_CONFIGURED" });
  });
});
