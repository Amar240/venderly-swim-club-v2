import { execSync } from "node:child_process";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

/** Runs once before the integration suite: applies migrations to swimclub_test. */
export default function globalSetup(): void {
  const testUrl = process.env.DATABASE_URL_TEST;

  if (!testUrl) {
    throw new Error("DATABASE_URL_TEST is not set. See tests/integration/setup.ts for instructions.");
  }

  if (!/\/swimclub_test(\?|$)/.test(testUrl)) {
    throw new Error('SAFETY GUARD: DATABASE_URL_TEST must point at the "swimclub_test" database.');
  }

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit"
  });
}
