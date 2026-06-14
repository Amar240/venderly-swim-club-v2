import { prisma } from "../../src/lib/prisma";

const TEST_DATABASE_NAME = "swimclub_test";

let verifiedTestDatabase = false;

const assertTestDatabase = async (): Promise<void> => {
  if (verifiedTestDatabase) {
    return;
  }

  const rows = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  const databaseName = rows[0]?.name;

  if (databaseName !== TEST_DATABASE_NAME) {
    throw new Error(
      `SAFETY GUARD: refusing to truncate database "${databaseName}". ` +
        `Integration tests only run against "${TEST_DATABASE_NAME}". Check DATABASE_URL_TEST.`
    );
  }

  verifiedTestDatabase = true;
};

/**
 * Truncates all application tables. Refuses to run outside swimclub_test.
 * If tests move to persistent global clubs/staff, keep login staff cleanup
 * test-local so stale PINs cannot leak between suites.
 */
export const resetDb = async (): Promise<void> => {
  await assertTestDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "checkin_events", "guest_pass_purchases", "webhook_events", "member_edit_logs", "persons", "memberships", "staff", "clubs" RESTART IDENTITY CASCADE'
  );
};
