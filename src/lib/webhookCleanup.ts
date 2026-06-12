import cron from "node-cron";
import { logger } from "./logger";
import { prisma } from "./prisma";

const CLEANUP_CRON = "0 3 * * *"; // 3 AM daily
const CLEANUP_TIME_ZONE = "America/New_York";
const RETENTION_DAYS = 90;

/**
 * Deletes PROCESSED webhook events older than the retention window.
 * FAILED rows are kept forever so they stay replayable until resolved;
 * RECEIVED rows are kept too (a permanently RECEIVED row indicates a
 * crash mid-processing and deserves investigation, not deletion).
 */
export const cleanupProcessedWebhookEvents = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.webhookEvent.deleteMany({
    where: {
      status: "PROCESSED",
      receivedAt: { lt: cutoff }
    }
  });

  logger.info("Webhook cleanup completed", { deleted: result.count, retentionDays: RETENTION_DAYS });
  return result.count;
};

export const runWebhookCleanupJob = async (): Promise<void> => {
  try {
    await cleanupProcessedWebhookEvents();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook cleanup error";
    logger.error("Webhook cleanup failed", { message });
  }
};

export const startWebhookCleanupJob = (): void => {
  if (process.env.DISABLE_WEBHOOK_CLEANUP === "true") {
    logger.info("Webhook cleanup scheduling disabled");
    return;
  }

  cron.schedule(CLEANUP_CRON, () => void runWebhookCleanupJob(), {
    timezone: CLEANUP_TIME_ZONE
  });
  logger.info("Webhook cleanup scheduled", { schedule: CLEANUP_CRON, timezone: CLEANUP_TIME_ZONE });
};
