import "dotenv/config";

const testUrl = process.env.DATABASE_URL_TEST;

if (!testUrl) {
  throw new Error(
    "DATABASE_URL_TEST is not set. Create the swimclub_test database and add " +
      "DATABASE_URL_TEST to your .env (same credentials as DATABASE_URL, database name swimclub_test)."
  );
}

if (!/\/swimclub_test(\?|$)/.test(testUrl)) {
  throw new Error(
    'SAFETY GUARD: DATABASE_URL_TEST must point at a database named exactly "swimclub_test". ' +
      "Refusing to run integration tests against anything else."
  );
}

// Point the app (Prisma) at the test database before any src module loads.
process.env.DATABASE_URL = testUrl;
process.env.WEBHOOK_SECRET = "test-webhook-secret";
process.env.JWT_SECRET = "test-jwt-secret";
