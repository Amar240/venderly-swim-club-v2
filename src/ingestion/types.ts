import { z } from "zod";

export type CanonicalPerson = {
  fullName: string;
  isPrimary: boolean;
  age?: number | null;
  phone?: string;
};

export type CanonicalMembership = {
  accountHolderName: string;
  email: string;
  phone: string;
  streetAddress?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  country?: string;
  memberCount: number;
  guestPasses?: number | null;
  paymentAmount?: number;
  orderId?: string;
  submittedAt?: string;
  medicalNotes?: string;
  persons: CanonicalPerson[];
};

export type IngestResult = {
  memberships: CanonicalMembership[];
  droppedColumns: string[];
  warnings: string[];
};

export const canonicalPersonSchema = z.object({
  fullName: z.string().trim().min(1),
  isPrimary: z.boolean(),
  age: z.number().int().min(0).max(120).nullable().optional(),
  phone: z.string().trim().min(1).optional()
});

export const canonicalMembershipSchema = z.object({
  accountHolderName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
  streetAddress: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  postalCode: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  country: z.string().trim().min(1).optional(),
  memberCount: z.number().int().min(1),
  guestPasses: z.number().int().min(0).nullable().optional(),
  paymentAmount: z.number().min(0).optional(),
  orderId: z.string().trim().min(1).optional(),
  submittedAt: z.string().datetime().optional(),
  medicalNotes: z.string().trim().min(1).optional(),
  persons: z.array(canonicalPersonSchema).min(1)
});

export const ingestResultSchema = z.object({
  memberships: z.array(canonicalMembershipSchema),
  droppedColumns: z.array(z.string()),
  warnings: z.array(z.string())
});
