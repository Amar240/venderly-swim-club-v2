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

const startDemoSchema = z.object({
  clubName: z.string().trim().min(1).max(160),
  contactName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().toLowerCase()
});

const clubParamsSchema = z.object({
  clubId: z.string().uuid()
});

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
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

demoRouter.post("/start", async (req, res, next) => {
  try {
    const input = startDemoSchema.parse(req.body);
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
          clubId: club.id
        }
      });

      return { club, prospect };
    });

    res.status(201).json({
      demoClubId: created.club.id,
      prospectId: created.prospect.id
    });
  } catch (error) {
    next(error);
  }
});

demoRouter.post("/:clubId/upload", (req, res, next) => {
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
      prisma.prospect.findFirst({ where: { clubId }, select: { id: true } })
    ]);

    if (!club || !prospect) {
      throw new HttpError(400, "INVALID_DEMO_CLUB", "Demo club was not found");
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
      throw new HttpError(422, "NO_VALID_MEMBERSHIPS", message);
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
