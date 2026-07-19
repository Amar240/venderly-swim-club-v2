import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { ingestFile } from "../ingestion/normalize";
import type { IngestResult } from "../ingestion/types";
import { loadIngestResult } from "../ingestion/load";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { createDemoRateLimit } from "../middleware/demoRateLimit";

const startDemoSchema = z.object({
  clubName: z.string().trim().min(1).max(160),
  contactName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().toLowerCase(),
  authorized: z.literal(true)
});

const clubParamsSchema = z.object({
  clubId: z.string().uuid()
});

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const configuredRetentionDays = Number.parseInt(process.env.DEMO_RETENTION_DAYS ?? "7", 10);
const RETENTION_DAYS = Number.isFinite(configuredRetentionDays) && configuredRetentionDays > 0
  ? configuredRetentionDays
  : 7;
const HOUR_MS = 60 * 60 * 1000;
const startRateLimit = createDemoRateLimit({ max: 20, windowMs: HOUR_MS });
const uploadRateLimit = createDemoRateLimit({ max: 20, windowMs: HOUR_MS });
const overviewRateLimit = createDemoRateLimit({ max: 120, windowMs: HOUR_MS });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES }
});

const slugify = (name: string): string => {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "demo-club";

  return `${base}-${randomUUID().slice(0, 8)}`;
};

const getExtension = (filename: string): string => filename.toLowerCase().split(".").pop() ?? "";

const persistFailedJob = async (input: {
  clubId: string;
  filename: string;
  detectedFormat: string;
  error: string;
  result?: IngestResult;
}): Promise<void> => {
  try {
    await prisma.ingestionJob.create({
      data: {
        clubId: input.clubId,
        rawFilename: input.filename,
        detectedFormat: input.detectedFormat,
        rowCount: input.result?.memberships.length ?? 0,
        status: "failed",
        warnings: input.result?.warnings ?? [],
        droppedColumns: input.result?.droppedColumns ?? [],
        error: input.error
      }
    });
  } catch (error) {
    logger.error("Failed to persist failed ingestion job", {
      clubId: input.clubId,
      filename: input.filename,
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

export const demoRouter = Router();

demoRouter.get("/:clubId/overview", overviewRateLimit, async (req, res, next) => {
  try {
    const { clubId } = clubParamsSchema.parse(req.params);
    const prospect = await prisma.prospect.findFirst({
      where: { clubId, expiresAt: { gt: new Date() } },
      select: { id: true, expiresAt: true }
    });

    // This public endpoint must never expose a real club's membership data.
    if (!prospect) {
      throw new HttpError(404, "DEMO_NOT_FOUND", "Demo club was not found");
    }

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        name: true,
        memberships: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            tier: true,
            guestPassesTotal: true,
            maxMembers: true,
            persons: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              select: {
                firstName: true,
                lastName: true,
                age: true,
                isPrimary: true,
                relationship: true
              }
            }
          }
        }
      }
    });

    if (!club) {
      throw new HttpError(404, "DEMO_NOT_FOUND", "Demo club was not found");
    }

    const tiers = new Map<string, number>();
    let members = 0;
    let families = 0;
    let guestPasses = 0;

    const memberships = club.memberships.map((membership) => {
      members += membership.persons.length;
      families += membership.persons.length > 1 ? 1 : 0;
      guestPasses += membership.guestPassesTotal;
      tiers.set(membership.tier, (tiers.get(membership.tier) ?? 0) + 1);

      const primary = membership.persons.find((person) => person.isPrimary) ?? membership.persons[0];
      const accountHolderName = primary
        ? `${primary.firstName} ${primary.lastName}`.trim()
        : "Unknown member";

      return {
        id: membership.id,
        accountHolderName,
        tier: membership.tier,
        guestPassesTotal: membership.guestPassesTotal,
        maxMembers: membership.maxMembers,
        persons: membership.persons
      };
    });

    res.json({
      club: { name: club.name },
      summary: {
        memberships: memberships.length,
        members,
        families,
        guestPasses,
        tiers: [...tiers.entries()]
          .map(([tier, count]) => ({ tier, count }))
          .sort((first, second) => second.count - first.count || first.tier.localeCompare(second.tier))
      },
      memberships
    });
  } catch (error) {
    next(error);
  }
});

demoRouter.post("/start", startRateLimit, async (req, res, next) => {
  try {
    const input = startDemoSchema.parse(req.body);
    const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const created = await prisma.$transaction(async (tx) => {
      const club = await tx.club.create({
        data: {
          name: input.clubName,
          slug: slugify(input.clubName),
          isActive: true
        }
      });
      const prospect = await tx.prospect.create({
        data: {
          clubName: input.clubName,
          contactName: input.contactName,
          email: input.email,
          clubId: club.id,
          expiresAt
        }
      });

      return { club, prospect };
    });

    res.status(201).json({
      demoClubId: created.club.id,
      prospectId: created.prospect.id,
      expiresAt: created.prospect.expiresAt.toISOString()
    });
  } catch (error) {
    next(error);
  }
});

demoRouter.post("/:clubId/upload", uploadRateLimit, (req, res, next) => {
  upload.single("file")(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(new HttpError(400, "FILE_TOO_LARGE", "File must be 10 MB or smaller"));
      return;
    }

    if (error) {
      next(new HttpError(400, "INVALID_UPLOAD", "The uploaded file could not be read"));
      return;
    }

    next();
  });
});

demoRouter.post("/:clubId/upload", async (req, res, next) => {
  try {
    const { clubId } = clubParamsSchema.parse(req.params);
    const file = req.file;

    if (!file) {
      throw new HttpError(400, "FILE_REQUIRED", "A spreadsheet file is required");
    }

    const [club, prospect] = await Promise.all([
      prisma.club.findUnique({ where: { id: clubId }, select: { id: true } }),
      prisma.prospect.findFirst({
        where: { clubId, expiresAt: { gt: new Date() } },
        select: { id: true }
      })
    ]);

    if (!club || !prospect) {
      throw new HttpError(404, "DEMO_NOT_FOUND", "Demo club was not found or has expired");
    }

    const detectedFormat = getExtension(file.originalname);
    const spreadsheetFormats = new Set(["csv", "xlsx", "xls"]);

    if (!spreadsheetFormats.has(detectedFormat) && detectedFormat !== "numbers") {
      throw new HttpError(400, "UNSUPPORTED_FILE_TYPE", "Please upload a CSV or Excel spreadsheet");
    }

    let result: IngestResult;

    try {
      result = ingestFile(file.buffer, file.originalname);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The spreadsheet could not be parsed";
      await persistFailedJob({
        clubId,
        filename: file.originalname,
        detectedFormat,
        error: message
      });
      throw new HttpError(400, "INGESTION_FAILED", message);
    }

    if (result.memberships.length === 0) {
      const message = "The spreadsheet did not contain any valid memberships";
      await persistFailedJob({
        clubId,
        filename: file.originalname,
        detectedFormat,
        error: message,
        result
      });
      res.status(422).json({
        status: "error",
        error: { code: "NO_VALID_MEMBERSHIPS", message },
        warnings: result.warnings.slice(0, 100)
      });
      return;
    }

    const summary = await loadIngestResult(
      prisma,
      { clubId, filename: file.originalname, detectedFormat },
      result
    );

    res.json(summary);
  } catch (error) {
    next(error);
  }
});
