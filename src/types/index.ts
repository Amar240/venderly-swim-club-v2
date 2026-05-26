import type { StaffRole } from "@prisma/client";

export type ApiStatus = "ok" | "error";

export interface ApiResponse<TData extends Record<string, unknown> = Record<string, unknown>> {
  status: ApiStatus;
  data?: TData;
  error?: {
    code: string;
    message: string;
  };
}

export interface AuthenticatedStaff {
  id: string;
  email: string;
  role: StaffRole;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: StaffRole;
}

export interface MemberLookupInput {
  membershipCode?: string;
  email?: string;
  phone?: string;
}

export interface MemberLookupResult {
  found: boolean;
  memberId?: string;
  matchedBy?: "membershipCode" | "email" | "phone";
}

export interface GuestPassValidationResult {
  valid: boolean;
  reason?: string;
  guestPassId?: string;
}

export interface CapacityResult {
  allowed: boolean;
  currentOccupancy: number;
  maxCapacity: number;
}

export interface GhlWebhookPayload {
  eventType?: string;
  contactId?: string;
  payload: Record<string, unknown>;
}
