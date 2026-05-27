import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { calculateInitialGuestPasses } from "../src/lib/guestPasses";

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const memberships = await prisma.membership.findMany({
    where: {
      guestPassesUsed: 0,
      guestPassesTotal: 0,
      submittedAt: { not: null }
    },
    select: {
      id: true,
      submittedAt: true
    }
  });

  let updatedCount = 0;

  for (const membership of memberships) {
    const newTotal = calculateInitialGuestPasses(membership.submittedAt);

    if (newTotal === 0) {
      continue;
    }

    await prisma.membership.update({
      where: { id: membership.id },
      data: { guestPassesTotal: newTotal }
    });
    updatedCount += 1;
  }

  console.log(`Updated ${updatedCount} memberships`);
};

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown guest pass backfill failure";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
