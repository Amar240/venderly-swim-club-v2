import type { RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { HttpError } from "./errorHandler";
import type { AuthenticatedStaff, JwtPayload } from "../types";

const jwtPayloadSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["STAFF", "ADMIN"])
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
  const decoded = jwt.verify(token, jwtSecret);
  const payload = jwtPayloadSchema.parse(decoded) satisfies JwtPayload;

  staffResponse.locals.staff = {
    id: payload.sub,
    email: payload.email,
    role: payload.role
  };

  next();
};
