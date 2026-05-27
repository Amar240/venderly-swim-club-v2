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
  clubId: string;
  email: string;
  role: StaffRole;
}

export interface JwtPayload {
  sub: string;
  clubId: string;
  email: string;
  role: StaffRole;
}

export interface PersonLookupInput {
  clubId: string;
  personId?: string;
  membershipCode?: string;
  email?: string;
  phone?: string;
}

export interface PersonLookupResult {
  found: boolean;
  ambiguous?: boolean;
  personId?: string;
  membershipId?: string;
  matchedBy?: "personId" | "membershipCode" | "email" | "phone";
}

export interface GuestPassValidationResult {
  valid: boolean;
  reason?: string;
  guestPassPurchaseId?: string;
  remainingUses?: number;
}

export interface CapacityResult {
  clubId: string;
  allowed: boolean;
  currentOccupancy: number;
  maxCapacity: number;
}

export interface GhlWebhookPayload {
  eventType?: string;
  contactId?: string;
  payload: Record<string, unknown>;
}
