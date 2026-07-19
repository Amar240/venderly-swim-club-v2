import { randomUUID } from "node:crypto";
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
    id: string;
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
      id: randomUUID(),
      clubId,
      tier: tier.tier,
      maxMembers: Math.max(tier.maxMembers, canonical.persons.length),
      paymentAmountCents: 0,
      guestPassesTotal: canonical.guestPasses ?? 0,
      addressStreet: null,
      addressCity: null,
      addressState: null,
      addressPostalCode: null,
      addressCountry: null,
      submittedAt: null,
      externalOrderId: null,
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
        email: null,
        phone: null,
        age: person.age ?? null,
        allergies: null,
        status: "ACTIVE" as const
      };
    })
  };
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown persistence error";

const BATCH_SIZE = 250;

const createPlans = async (
  prisma: PrismaClient,
  plans: PersistencePlan[]
): Promise<void> => {
  await prisma.$transaction([
    prisma.membership.createMany({ data: plans.map((plan) => plan.membership) }),
    prisma.person.createMany({
      data: plans.flatMap((plan) =>
        plan.persons.map((person) => ({
          ...person,
          membershipId: plan.membership.id
        }))
      )
    })
  ]);
};

const createSinglePlan = async (prisma: PrismaClient, plan: PersistencePlan): Promise<void> => {
  await prisma.$transaction([
    prisma.membership.create({ data: plan.membership }),
    prisma.person.createMany({
      data: plan.persons.map((person) => ({
        ...person,
        membershipId: plan.membership.id
      }))
    })
  ]);
};

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

  for (let index = 0; index < result.memberships.length; index += BATCH_SIZE) {
    const canonicalBatch = result.memberships.slice(index, index + BATCH_SIZE);
    const plans = canonicalBatch.map((canonical) => mapCanonicalMembership(ctx.clubId, canonical));
    try {
      await createPlans(prisma, plans);
      membershipsCreated += plans.length;
      personsCreated += plans.reduce((sum, plan) => sum + plan.persons.length, 0);
      continue;
    } catch {
      // A batch failure falls back to isolated household transactions so one
      // malformed row never prevents the rest of the upload from loading.
    }

    for (const [batchIndex, plan] of plans.entries()) {
      const canonical = canonicalBatch[batchIndex]!;
      try {
        await createSinglePlan(prisma, plan);
        membershipsCreated += 1;
        personsCreated += plan.persons.length;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          warnings.push(`Skipped ${canonical.accountHolderName}: a unique membership value already exists.`);
          continue;
        }

        warnings.push(`Skipped ${canonical.accountHolderName}: ${errorMessage(error)}`);
      }
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
