import type { RequestHandler } from "express";
import { HttpError } from "./errorHandler";
import type { StaffResponse } from "./jwtAuth";

export const adminAuth: RequestHandler = (_req, res, next) => {
  const staffResponse = res as StaffResponse;

  if (staffResponse.locals.staff.role !== "ADMIN") {
    next(new HttpError(403, "ADMIN_REQUIRED", "Admin role required"));
    return;
  }

  next();
};
