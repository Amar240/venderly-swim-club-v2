import { Prisma, PrismaClient } from "@prisma/client";
import {
  parseMembershipTier,
  parseMembershipTierFromPaymentAmount,
  splitFullName
} from "../handlers/signup";
import type { CanonicalMembership, IngestResult } from "./types";

export type LoadContext = {
  clubId: string;
  filename: string;
  detectedFormat: string;
};

export type PersistencePlan = {
  membership: {
    clubId: string;
    tier: string;
    maxMembers: number;
    paymentAmountCents: number;
    guestPassesTotal: number;
    addressStreet: string | null;
    addressCity: string | null;
    addressState: string | null;
    addressPostalCode: string | null;
    addressCountry: string | null;
    submittedAt: Date | null;
    externalOrderId: string | null;
    source: string;
    status: "ACTIVE";
  };
  persons: Array<{
    clubId: string;
    firstName: string;
    lastName: string;
    isPrimary: boolean;
    relationship: string;
    email: string | null;
    phone: string | null;
    age: number | null;
    allergies: string | null;
    status: "ACTIVE";
  }>;
};

export const mapCanonicalMembership = (
  clubId: string,
  canonical: CanonicalMembership
): PersistencePlan => {
  const tier =
    parseMembershipTierFromPaymentAmount(canonical.paymentAmount) ??
    parseMembershipTier(String(canonical.memberCount));

  return {
    membership: {
      clubId,
      tier: tier.tier,
      maxMembers: Math.max(tier.maxMembers, canonical.persons.length),
      paymentAmountCents: Math.round((canonical.paymentAmount ?? 0) * 100),
      guestPassesTotal: canonical.guestPasses ?? 0,
      addressStreet: canonical.streetAddress ?? null,
      addressCity: canonical.city ?? null,
      addressState: canonical.state ?? null,
      addressPostalCode: canonical.postalCode ?? null,
      addressCountry: canonical.country ?? null,
      submittedAt: canonical.submittedAt ? new Date(canonical.submittedAt) : null,
      externalOrderId: canonical.orderId ?? null,
      source: "demo_import",
      status: "ACTIVE"
    },
    persons: canonical.persons.map((person) => {
      const { firstName, lastName } = splitFullName(person.fullName);

      return {
        clubId,
        firstName,
        lastName,
        isPrimary: person.isPrimary,
        relationship: person.isPrimary ? "self" : "member",
        email: person.isPrimary ? canonical.email : null,
        phone: person.phone ?? null,
        age: person.age ?? null,
        allergies: person.isPrimary ? canonical.medicalNotes ?? null : null,
        status: "ACTIVE" as const
      };
    })
  };
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown persistence error";

export const loadIngestResult = async (
  prisma: PrismaClient,
  ctx: LoadContext,
  result: IngestResult
): Promise<{
  jobId: string;
  membershipsCreated: number;
  personsCreated: number;
  warnings: string[];
}> => {
  const warnings = [...result.warnings];
  let membershipsCreated = 0;
  let personsCreated = 0;

  for (const canonical of result.memberships) {
    const plan = mapCanonicalMembership(ctx.clubId, canonical);

    try {
      await prisma.$transaction(async (tx) => {
        const membership = await tx.membership.create({ data: plan.membership });

        await tx.person.createMany({
          data: plan.persons.map((person) => ({
            ...person,
            membershipId: membership.id
          }))
        });
      });

      membershipsCreated += 1;
      personsCreated += plan.persons.length;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        warnings.push(
          `Skipped ${canonical.accountHolderName}: external order ID ${canonical.orderId ?? "unknown"} already exists.`
        );
        continue;
      }

      warnings.push(`Skipped ${canonical.accountHolderName}: ${errorMessage(error)}`);
    }
  }

  const job = await prisma.ingestionJob.create({
    data: {
      clubId: ctx.clubId,
      rawFilename: ctx.filename,
      detectedFormat: ctx.detectedFormat,
      rowCount: result.memberships.length,
      status: "loaded",
      warnings,
      droppedColumns: result.droppedColumns
    }
  });

  return {
    jobId: job.id,
    membershipsCreated,
    personsCreated,
    warnings
  };
};
