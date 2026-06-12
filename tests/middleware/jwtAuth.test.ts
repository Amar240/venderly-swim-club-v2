import type { NextFunction, Request } from "express";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../src/middleware/errorHandler";
import { jwtAuth } from "../../src/middleware/jwtAuth";

const makeReq = (authorization?: string): Request =>
  ({
    header: vi.fn((name: string) => (name === "Authorization" ? authorization : undefined))
  }) as unknown as Request;

const makeRes = () =>
  ({
    locals: {}
  });

describe("jwtAuth", () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalJwtSecret;
    vi.restoreAllMocks();
  });

  it("populates staff locals for a valid token and calls next", () => {
    const token = jwt.sign(
      { sub: "staff_1", clubId: "club_1", email: "staff@example.com", role: "STAFF" },
      "test-secret"
    );
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next: NextFunction = vi.fn();

    jwtAuth(req, res as never, next);

    expect(res.locals.staff).toEqual({
      id: "staff_1",
      clubId: "club_1",
      email: "staff@example.com",
      role: "STAFF"
    });
    expect(next).toHaveBeenCalledWith();
  });

  it("returns a 401 when the Authorization header is missing", () => {
    const next: NextFunction = vi.fn();

    jwtAuth(makeReq(), makeRes() as never, next);

    const error = vi.mocked(next).mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 401, code: "MISSING_AUTH_TOKEN" });
  });

  it("returns a 401 for malformed tokens", () => {
    const next: NextFunction = vi.fn();

    jwtAuth(makeReq("Bearer not-a-token"), makeRes() as never, next);

    const error = vi.mocked(next).mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 401 });
  });

  it("returns a 401 for tokens signed with a different secret", () => {
    const token = jwt.sign(
      { sub: "staff_1", clubId: "club_1", email: "staff@example.com", role: "STAFF" },
      "other-secret"
    );
    const next: NextFunction = vi.fn();

    jwtAuth(makeReq(`Bearer ${token}`), makeRes() as never, next);

    const error = vi.mocked(next).mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 401 });
  });

  it("returns a 500 when JWT_SECRET is missing", () => {
    delete process.env.JWT_SECRET;
    const next: NextFunction = vi.fn();

    jwtAuth(makeReq("Bearer token"), makeRes() as never, next);

    const error = vi.mocked(next).mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 500, code: "JWT_SECRET_NOT_CONFIGURED" });
  });
});
