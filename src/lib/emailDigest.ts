import cron from "node-cron";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  buildGuestPasses,
  buildPeakHeatmap,
  calculateKpiStats,
  countOpenDays,
  getReportWindow,
  hourLabel,
  weekdayName,
  zeroFillDailyVisits
} from "../handlers/reports";
import { logger } from "./logger";
import { prisma } from "./prisma";

/*
 * MANUAL AWS SETUP REQUIRED before email works:
 * 1. Add ses:SendEmail to the App Runner instance IAM role
 * 2. Verify SES_FROM_ADDRESS as a sender identity in the SES console (us-east-2)
 * 3. Verify RYAN_EMAIL in the SES console
 *    (or request SES production access to lift the sandbox restriction)
 * 4. Add env vars to App Runner:
 *    RYAN_EMAIL=ryan@venderly.us
 *    SES_FROM_ADDRESS=noreply@govenderly.us
 *    DASHBOARD_URL=https://pooladmin.govenderly.us
 * Without these, the digest job logs a warning/failure every Monday and sends nothing.
 */

const DIGEST_CRON = "0 8 * * 1"; // Monday 8 AM
const DIGEST_TIME_ZONE = "America/New_York";

export type DigestData = {
  totalVisits: number;
  avgPerOpenDay: number;
  openDays: number;
  newMembers: number;
  revenueCents: number;
  topInsight: string | null;
  weekStart: Date;
  weekEnd: Date;
};

export const buildDigestData = async (): Promise<DigestData> => {
  const club = await prisma.club.findFirstOrThrow({
    where: { isActive: true },
    select: { id: true }
  });
  const window = getReportWindow("week");

  const [checkins, purchases, newMembers] = await Promise.all([
    prisma.checkinEvent.findMany({
      where: {
        clubId: club.id,
        checkedInAt: { gte: window.start, lt: window.end }
      },
      select: {
        checkedInAt: true,
        signedOutAt: true,
        personId: true,
        membershipId: true,
        numGuests: true
      }
    }),
    prisma.guestPassPurchase.findMany({
      where: {
        clubId: club.id,
        purchasedAt: { gte: window.start, lt: window.end }
      },
      select: {
        quantityPurchased: true,
        membershipId: true,
        membership: {
          select: {
            persons: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              select: { firstName: true, lastName: true, email: true, isPrimary: true }
            }
          }
        },
        person: { select: { firstName: true, lastName: true } }
      }
    }),
    prisma.membership.count({
      where: {
        clubId: club.id,
        submittedAt: { gte: window.start, lt: window.end }
      }
    })
  ]);

  const dailyVisits = zeroFillDailyVisits(window.dayKeys, checkins);
  const openDays = countOpenDays(dailyVisits);
  const { totalVisits, avgPerOpenDay } = calculateKpiStats(checkins, openDays);
  const { revenueCents } = buildGuestPasses(purchases, checkins);

  const busiest = buildPeakHeatmap(checkins).reduce<{ weekday: number; hour: number; count: number } | null>(
    (current, cell) => (!current || cell.count > current.count ? cell : current),
    null
  );
  const topInsight =
    busiest && busiest.count > 0
      ? `${weekdayName(busiest.weekday)} around ${hourLabel(busiest.hour)} were the busiest hours this week.`
      : null;

  return {
    totalVisits,
    avgPerOpenDay,
    openDays,
    newMembers,
    revenueCents,
    topInsight,
    weekStart: window.start,
    weekEnd: window.end
  };
};

export const sendWeeklyDigest = async (): Promise<void> => {
  const recipient = process.env.RYAN_EMAIL;
  const fromAddress = process.env.SES_FROM_ADDRESS;

  if (!recipient || !fromAddress) {
    logger.warn("Email digest skipped: RYAN_EMAIL or SES_FROM_ADDRESS not set");
    return;
  }

  const data = await buildDigestData();
  const dateOptions: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: DIGEST_TIME_ZONE };
  const weekLabel = `${data.weekStart.toLocaleDateString("en-US", dateOptions)} – ${data.weekEnd.toLocaleDateString("en-US", dateOptions)}`;
  const revenueDollars = (data.revenueCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
  const dashboardUrl = process.env.DASHBOARD_URL ?? "https://pooladmin.govenderly.us";

  const lines = [
    `Wedgewood Weekly Summary (${weekLabel})`,
    "",
    `Total visits:       ${data.totalVisits}`,
    `Avg per open day:   ${Math.round(data.avgPerOpenDay)}`,
    `Open days:          ${data.openDays}`,
    `New members:        ${data.newMembers}`,
    `Guest pass revenue: ${revenueDollars}`
  ];

  if (data.topInsight) {
    lines.push("", data.topInsight);
  }

  lines.push("", `Dashboard: ${dashboardUrl}`);

  const client = new SESv2Client({ region: process.env.AWS_REGION ?? "us-east-2" });
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: fromAddress,
      Destination: { ToAddresses: [recipient] },
      Content: {
        Simple: {
          Subject: { Data: `Wedgewood Weekly: ${weekLabel}` },
          Body: { Text: { Data: lines.join("\n") } }
        }
      }
    })
  );
  logger.info("Weekly email digest sent", { to: recipient });
};

export const runEmailDigestJob = async (): Promise<void> => {
  try {
    await sendWeeklyDigest();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email digest error";
    logger.error("Email digest failed", { message });
  }
};

export const startEmailDigestJob = (): void => {
  if (process.env.DISABLE_EMAIL_DIGEST === "true") {
    logger.info("Email digest scheduling disabled");
    return;
  }

  cron.schedule(DIGEST_CRON, () => void runEmailDigestJob(), {
    timezone: DIGEST_TIME_ZONE
  });
  logger.info("Email digest scheduled", { schedule: DIGEST_CRON, timezone: DIGEST_TIME_ZONE });
};
