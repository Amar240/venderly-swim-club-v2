import type { RequestHandler } from "express";
import { HttpError } from "./errorHandler";
import type { StaffResponse } from "./jwtAuth";

export const blockDemoFeature: RequestHandler = (_req, res, next) => {
  const staffResponse = res as StaffResponse;
  if (staffResponse.locals.staff.demoAdmin) {
    next(new HttpError(403, "DEMO_FEATURE_UNAVAILABLE", "This feature is not available in the demo"));
    return;
  }
  next();
};
