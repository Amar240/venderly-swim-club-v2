import cron from "node-cron";
import { logger } from "./logger";
import { prisma } from "./prisma";

const CLEANUP_CRON = "30 3 * * *";
const CLEANUP_TIME_ZONE = "America/New_York";

export const cleanupExpiredDemos = async (): Promise<number> => {
  const expired = await prisma.prospect.findMany({
    where: { expiresAt: { lte: new Date() } },
    select: { id: true, clubId: true }
  });
  const prospectIds = expired.map((prospect) => prospect.id);
  const clubIds = expired.flatMap((prospect) => (prospect.clubId ? [prospect.clubId] : []));

  if (prospectIds.length === 0) {
    logger.info("Demo cleanup completed", { deleted: 0 });
    return 0;
  }

  await prisma.$transaction([
    prisma.ingestionJob.deleteMany({ where: { clubId: { in: clubIds } } }),
    prisma.prospect.deleteMany({ where: { id: { in: prospectIds } } }),
    prisma.club.deleteMany({ where: { id: { in: clubIds } } })
  ]);

  logger.info("Demo cleanup completed", { deleted: prospectIds.length });
  return prospectIds.length;
};

export const runDemoCleanupJob = async (): Promise<void> => {
  try {
    await cleanupExpiredDemos();
  } catch (error) {
    logger.error("Demo cleanup failed", {
      message: error instanceof Error ? error.message : "Unknown demo cleanup error"
    });
  }
};

export const startDemoCleanupJob = (): void => {
  if (process.env.DISABLE_DEMO_CLEANUP === "true") {
    logger.info("Demo cleanup scheduling disabled");
    return;
  }

  cron.schedule(CLEANUP_CRON, () => void runDemoCleanupJob(), { timezone: CLEANUP_TIME_ZONE });
  logger.info("Demo cleanup scheduled", { schedule: CLEANUP_CRON, timezone: CLEANUP_TIME_ZONE });
};
