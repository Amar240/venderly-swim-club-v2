import jwt from "jsonwebtoken";
import type { StaffRole } from "@prisma/client";
import { HttpError } from "../middleware/errorHandler";

type TokenStaff = {
  id: string;
  clubId: string;
  email: string;
  role: StaffRole;
};

export const signStaffToken = (
  staff: TokenStaff,
  options: { demoAdmin?: boolean; expiresAt?: Date; maxLifetimeSeconds?: number } = {}
): { token: string; expiresAt: Date } => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new HttpError(500, "JWT_SECRET_NOT_CONFIGURED", "JWT secret is not configured");

  const nowSeconds = Math.floor(Date.now() / 1000);
  const maxLifetimeSeconds = options.maxLifetimeSeconds ?? 8 * 60 * 60;
  const requestedExpirySeconds = options.expiresAt
    ? Math.floor(options.expiresAt.getTime() / 1000)
    : nowSeconds + maxLifetimeSeconds;
  const expirySeconds = Math.min(nowSeconds + maxLifetimeSeconds, requestedExpirySeconds);

  if (expirySeconds <= nowSeconds) {
    throw new HttpError(404, "DEMO_NOT_FOUND", "Demo club was not found or has expired");
  }

  const token = jwt.sign(
    {
      sub: staff.id,
      clubId: staff.clubId,
      email: staff.email,
      role: staff.role,
      ...(options.demoAdmin ? { demoAdmin: true } : {})
    },
    secret,
    { expiresIn: expirySeconds - nowSeconds }
  );

  return { token, expiresAt: new Date(expirySeconds * 1000) };
};
