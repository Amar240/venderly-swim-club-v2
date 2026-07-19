import type { RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { HttpError } from "./errorHandler";
import type { AuthenticatedStaff, JwtPayload } from "../types";

const jwtPayloadSchema = z.object({
  sub: z.string().min(1),
  clubId: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["STAFF", "ADMIN"]),
  demoAdmin: z.literal(true).optional()
});

export interface StaffLocals {
  staff: AuthenticatedStaff;
}

export type StaffResponse<TBody = unknown> = Response<TBody, StaffLocals>;

export const jwtAuth: RequestHandler = (req, res, next) => {
  const staffResponse = res as StaffResponse;
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    next(new HttpError(500, "JWT_SECRET_NOT_CONFIGURED", "JWT secret is not configured"));
    return;
  }

  const authorization = req.header("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    next(new HttpError(401, "MISSING_AUTH_TOKEN", "Missing bearer token"));
    return;
  }

  const token = authorization.slice("Bearer ".length);
  let payload: JwtPayload;

  try {
    const decoded = jwt.verify(token, jwtSecret);
    payload = jwtPayloadSchema.parse(decoded) satisfies JwtPayload;
  } catch {
    next(new HttpError(401, "INVALID_AUTH_TOKEN", "Invalid bearer token"));
    return;
  }

  staffResponse.locals.staff = {
    id: payload.sub,
    clubId: payload.clubId,
    email: payload.email,
    role: payload.role,
    demoAdmin: payload.demoAdmin
  };

  next();
};
