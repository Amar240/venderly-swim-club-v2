import type { NextFunction, Request, Response } from "express";
import { ZodError, z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, errorHandler, notFoundHandler } from "../../src/middleware/errorHandler";

const makeRes = () => {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res)
  };

  return res;
};

describe("HttpError", () => {
  it("stores status and code", () => {
    const error = new HttpError(418, "TEAPOT", "Short and stout");

    expect(error.statusCode).toBe(418);
    expect(error.code).toBe("TEAPOT");
    expect(error.message).toBe("Short and stout");
  });
});

describe("notFoundHandler", () => {
  it("passes a not found HttpError to next", () => {
    const req = { method: "GET", originalUrl: "/missing" } as Request;
    const next: NextFunction = vi.fn();

    notFoundHandler(req, {} as Response, next);

    expect(vi.mocked(next).mock.calls[0]?.[0]).toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND"
    });
  });
});

describe("errorHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders zod validation errors", () => {
    const res = makeRes();
    const result = z.string().email().safeParse("bad");
    const error = result.success ? new ZodError([]) : result.error;

    errorHandler(error, {} as Request, res as unknown as Response, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "VALIDATION_ERROR" })
      })
    );
  });

  it("renders HttpError responses", () => {
    const res = makeRes();

    errorHandler(new HttpError(401, "NOPE", "Nope"), {} as Request, res as unknown as Response, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      status: "error",
      error: {
        code: "NOPE",
        message: "Nope"
      }
    });
  });

  it("renders unexpected errors as internal server errors", () => {
    const res = makeRes();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    errorHandler(new Error("boom"), {} as Request, res as unknown as Response, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" })
      })
    );
  });
});
