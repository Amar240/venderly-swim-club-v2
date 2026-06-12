import cron from "node-cron";
import { logger } from "./logger";
import { prisma } from "./prisma";

const AUTO_SIGNOUT_CRON = "59 23 * * *";
const AUTO_SIGNOUT_TIME_ZONE = "America/New_York";

export const signOutAllActive = async (): Promise<number> => {
  const result = await prisma.checkinEvent.updateMany({
    where: { isActive: true },
    data: {
      isActive: false,
      signedOutAt: new Date()
    }
  });

  logger.info("Auto sign-out completed", { count: result.count });
  return result.count;
};

export const runAutoSignoutJob = async (): Promise<void> => {
  try {
    // Clears forgotten active check-ins so members are not blocked by ALREADY_CHECKED_IN the next day.
    await signOutAllActive();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown auto sign-out error";
    logger.error("Auto sign-out failed", { message });
  }
};

export const startAutoSignoutJob = (): void => {
  if (process.env.DISABLE_AUTO_SIGNOUT === "true") {
    logger.info("Auto sign-out scheduling disabled");
    return;
  }

  cron.schedule(AUTO_SIGNOUT_CRON, () => void runAutoSignoutJob(), {
    timezone: AUTO_SIGNOUT_TIME_ZONE
  });
  logger.info("Auto sign-out scheduled", { schedule: AUTO_SIGNOUT_CRON, timezone: AUTO_SIGNOUT_TIME_ZONE });
};
