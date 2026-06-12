import type { NextFunction, Request } from "express";
import { describe, expect, it, vi } from "vitest";
import { adminAuth } from "../../src/middleware/adminAuth";
import { HttpError } from "../../src/middleware/errorHandler";

describe("adminAuth", () => {
  it("calls next for admin staff", () => {
    const next: NextFunction = vi.fn();
    const res = {
      locals: {
        staff: { role: "ADMIN" }
      }
    };

    adminAuth({} as Request, res as never, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("returns ADMIN_REQUIRED for regular staff", () => {
    const next: NextFunction = vi.fn();
    const res = {
      locals: {
        staff: { role: "STAFF" }
      }
    };

    adminAuth({} as Request, res as never, next);

    const error = vi.mocked(next).mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 403, code: "ADMIN_REQUIRED" });
  });
});
