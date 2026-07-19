import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { proposeMapping } from "../ingestion/aiMapper";
import { analyzeIngestFile, ingestFile } from "../ingestion/normalize";
import {
  aiMappingOverrides,
  EDITABLE_MAPPING_TARGETS,
  mergeMappingSuggestions,
  type MappingOverride
} from "../ingestion/mapping";
import type { IngestResult } from "../ingestion/types";
import { loadIngestResult } from "../ingestion/load";
import { HEADER_SCAN_ROWS, InvalidHeaderRowError } from "../ingestion/parse";
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

const mappingOverridesSchema = z.array(z.object({
  sourceColumn: z.string().min(1),
  targetField: z.enum(EDITABLE_MAPPING_TARGETS).nullable()
}));

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const configuredRetentionDays = Number.parseInt(process.env.DEMO_RETENTION_DAYS ?? "7", 10);
const RETENTION_DAYS = Number.isFinite(configuredRetentionDays) && configuredRetentionDays > 0
  ? configuredRetentionDays
  : 7;
const HOUR_MS = 60 * 60 * 1000;
const startRateLimit = createDemoRateLimit({ max: 20, windowMs: HOUR_MS });
const uploadRateLimit = createDemoRateLimit({ max: 20, windowMs: HOUR_MS });
const overviewRateLimit = createDemoRateLimit({ max: 120, windowMs: HOUR_MS });
const SAMPLE_FILENAME = "sample-swim-club.csv";
const SAMPLE_FILE_PATH = join(process.cwd(), "assets", "samples", SAMPLE_FILENAME);
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

const validateSpreadsheetFormat = (filename: string): string => {
  const detectedFormat = getExtension(filename);
  const spreadsheetFormats = new Set(["csv", "xlsx", "xls"]);

  if (!spreadsheetFormats.has(detectedFormat) && detectedFormat !== "numbers") {
    throw new HttpError(400, "UNSUPPORTED_FILE_TYPE", "Please upload a CSV or Excel spreadsheet");
  }

  return detectedFormat;
};

const parseMappingOverrides = (value: unknown): MappingOverride[] => {
  if (value === undefined) {
    return [];
  }

  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_MAPPING_OVERRIDES", "Mapping changes must be valid JSON");
  }

  try {
    return mappingOverridesSchema.parse(JSON.parse(value));
  } catch {
    throw new HttpError(400, "INVALID_MAPPING_OVERRIDES", "Mapping changes are invalid");
  }
};

const parseHeaderRowIndex = (value: unknown): number | undefined => {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new HttpError(400, "INVALID_HEADER_ROW", "Header row must be a non-negative whole number");
  }

  const index = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(index) || index >= HEADER_SCAN_ROWS) {
    throw new HttpError(400, "INVALID_HEADER_ROW", `Header row must be within the first ${HEADER_SCAN_ROWS} rows`);
  }

  return index;
};

const toIngestionError = (error: unknown): HttpError => {
  const message = error instanceof Error ? error.message : "The spreadsheet could not be parsed";
  return error instanceof InvalidHeaderRowError
    ? new HttpError(400, "INVALID_HEADER_ROW", message)
    : new HttpError(400, "INGESTION_FAILED", message);
};

const receiveDemoFile: RequestHandler = (req, res, next) => {
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
};

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

const assertUsableDemoClub = async (clubId: string): Promise<void> => {
  const [club, prospect] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId }, select: { id: true } }),
    prisma.prospect.findFirst({
      where: { clubId, expiresAt: { gt: new Date() } },
      select: { id: true }
    })
  ]);

  // Step 7 should add the not-provisioned condition here so every demo
  // ingestion path receives the new gate from this single helper.
  if (!club || !prospect) {
    throw new HttpError(404, "DEMO_NOT_FOUND", "Demo club was not found or has expired");
  }
};

const ingestAndLoadDemo = async (input: {
  clubId: string;
  buffer: Buffer;
  filename: string;
  detectedFormat: string;
  mappingOverrides?: MappingOverride[];
  headerRowIndex?: number;
}): Promise<
  | {
      status: 200;
      body: Awaited<ReturnType<typeof loadIngestResult>>;
    }
  | {
      status: 422;
      body: {
        status: "error";
        error: { code: "NO_VALID_MEMBERSHIPS"; message: string };
        warnings: string[];
      };
    }
> => {
  let result: IngestResult;

  try {
    result = ingestFile(input.buffer, input.filename, input.mappingOverrides, {
      headerRowIndex: input.headerRowIndex
    });
  } catch (error) {
    if (error instanceof InvalidHeaderRowError) {
      throw toIngestionError(error);
    }
    const message = error instanceof Error ? error.message : "The spreadsheet could not be parsed";
    await persistFailedJob({
      clubId: input.clubId,
      filename: input.filename,
      detectedFormat: input.detectedFormat,
      error: message
    });
    throw new HttpError(400, "INGESTION_FAILED", message);
  }

  if (result.memberships.length === 0) {
    const message = "The spreadsheet did not contain any valid memberships";
    await persistFailedJob({
      clubId: input.clubId,
      filename: input.filename,
      detectedFormat: input.detectedFormat,
      error: message,
      result
    });
    return {
      status: 422,
      body: {
        status: "error",
        error: { code: "NO_VALID_MEMBERSHIPS", message },
        warnings: result.warnings.slice(0, 100)
      }
    };
  }

  return {
    status: 200,
    body: await loadIngestResult(
      prisma,
      {
        clubId: input.clubId,
        filename: input.filename,
        detectedFormat: input.detectedFormat
      },
      result
    )
  };
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

demoRouter.post("/:clubId/preview", uploadRateLimit, receiveDemoFile, async (req, res, next) => {
  try {
    const { clubId } = clubParamsSchema.parse(req.params);
    const file = req.file;

    if (!file) {
      throw new HttpError(400, "FILE_REQUIRED", "A spreadsheet file is required");
    }

    await assertUsableDemoClub(clubId);
    validateSpreadsheetFormat(file.originalname);
    const headerRowIndex = parseHeaderRowIndex(req.body?.headerRowIndex);

    let analysis: ReturnType<typeof analyzeIngestFile>;
    try {
      analysis = analyzeIngestFile(file.buffer, file.originalname, [], { headerRowIndex });
    } catch (error) {
      throw toIngestionError(error);
    }

    const unresolvedColumns = analysis.mapping
      .filter((entry) =>
        entry.targetField === null &&
        !entry.groupKey &&
        !analysis.result.droppedColumns.includes(entry.sourceColumn)
      )
      .map((entry) => ({
        sourceColumn: entry.sourceColumn,
        sampleValues: entry.sampleValues
      }));
    const suggestions = await proposeMapping(unresolvedColumns);
    const mapping = mergeMappingSuggestions(analysis.mapping, suggestions);
    const effectiveOverrides = aiMappingOverrides(mapping);
    const effectiveAnalysis = effectiveOverrides.length > 0
      ? analyzeIngestFile(file.buffer, file.originalname, effectiveOverrides, {
          headerRowIndex: analysis.structure.headerRowIndex,
          detectedBy: analysis.structure.detectedBy
        })
      : analysis;

    res.json({
      mapping,
      droppedColumns: effectiveAnalysis.result.droppedColumns,
      stats: effectiveAnalysis.stats,
      sampleMemberships: effectiveAnalysis.result.memberships.slice(0, 3),
      warnings: effectiveAnalysis.result.warnings,
      structure: effectiveAnalysis.structure
    });
  } catch (error) {
    next(error);
  }
});

demoRouter.post("/:clubId/upload", uploadRateLimit, receiveDemoFile, async (req, res, next) => {
  try {
    const { clubId } = clubParamsSchema.parse(req.params);
    const file = req.file;

    if (!file) {
      throw new HttpError(400, "FILE_REQUIRED", "A spreadsheet file is required");
    }

    await assertUsableDemoClub(clubId);

    const detectedFormat = validateSpreadsheetFormat(file.originalname);
    const mappingOverrides = parseMappingOverrides(req.body?.mappingOverrides);
    const headerRowIndex = parseHeaderRowIndex(req.body?.headerRowIndex);

    const outcome = await ingestAndLoadDemo({
      clubId,
      buffer: file.buffer,
      filename: file.originalname,
      detectedFormat,
      mappingOverrides,
      headerRowIndex
    });
    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    next(error);
  }
});

demoRouter.post("/:clubId/sample", uploadRateLimit, async (req, res, next) => {
  try {
    const { clubId } = clubParamsSchema.parse(req.params);
    await assertUsableDemoClub(clubId);

    let buffer: Buffer;
    try {
      buffer = readFileSync(SAMPLE_FILE_PATH);
    } catch (error) {
      logger.error("Demo sample file is unavailable", {
        path: SAMPLE_FILE_PATH,
        message: error instanceof Error ? error.message : "Unknown file error"
      });
      throw new HttpError(
        500,
        "SAMPLE_FILE_UNAVAILABLE",
        "The sample club is temporarily unavailable"
      );
    }

    const outcome = await ingestAndLoadDemo({
      clubId,
      buffer,
      filename: SAMPLE_FILENAME,
      detectedFormat: "csv"
    });
    res.status(outcome.status).json({ ...outcome.body, isSample: true });
  } catch (error) {
    next(error);
  }
});
