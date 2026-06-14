import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

import { execSync } from "node:child_process";
import bcrypt from "bcrypt";
import { PrismaClient, type StaffRole } from "@prisma/client";

const prisma = new PrismaClient();

const WEDGEWOOD_CLUB_ID = "9dd5014c-8c15-4959-869c-2f61dc80c8af";
const BCRYPT_ROUNDS = 10;
const DEV_DATABASE_NAME = "swimclub_dev";

const staffSeeds = [
  {
    email: "admin@wedgewood.com",
    name: "Wedgewood Admin",
    pin: "9876",
    role: "ADMIN" as StaffRole
  },
  {
    email: "staff@wedgewood.com",
    name: "Wedgewood Staff",
    pin: "2026",
    role: "STAFF" as StaffRole
  }
];

const getDevDatabaseUrl = (): string => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed local dev data.");
  }

  if (!new RegExp(`/${DEV_DATABASE_NAME}(\\?|$)`).test(databaseUrl)) {
    throw new Error(`Refusing to seed local dev data: DATABASE_URL must point at ${DEV_DATABASE_NAME}.`);
  }

  return databaseUrl;
};

const main = async (): Promise<void> => {
  const databaseUrl = getDevDatabaseUrl();

  console.log(`Applying migrations to ${DEV_DATABASE_NAME}...`);
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit"
  });

  const club = await prisma.club.upsert({
    where: { id: WEDGEWOOD_CLUB_ID },
    update: {
      name: "Wedgewood Swim Club",
      slug: "wedgewood",
      maxCapacity: 80,
      isActive: true
    },
    create: {
      id: WEDGEWOOD_CLUB_ID,
      name: "Wedgewood Swim Club",
      slug: "wedgewood",
      maxCapacity: 80,
      isActive: true
    },
    select: { id: true, name: true, slug: true, maxCapacity: true }
  });

  const staffResults = [];

  for (const staff of staffSeeds) {
    const passwordHash = await bcrypt.hash(staff.pin, BCRYPT_ROUNDS);
    const result = await prisma.staff.upsert({
      where: { email: staff.email },
      update: {
        clubId: WEDGEWOOD_CLUB_ID,
        name: staff.name,
        role: staff.role,
        isActive: true,
        passwordHash
      },
      create: {
        clubId: WEDGEWOOD_CLUB_ID,
        email: staff.email,
        name: staff.name,
        role: staff.role,
        isActive: true,
        passwordHash
      },
      select: { email: true, name: true, role: true, isActive: true }
    });
    staffResults.push(result);
  }

  console.log("Local dev seed restored.");
  console.log(`Club: ${club.name} (${club.id}), slug=${club.slug}, capacity=${club.maxCapacity}`);
  for (const staff of staffResults) {
    console.log(`Staff: ${staff.email}, role=${staff.role}, active=${staff.isActive}`);
  }
};

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown local seed failure";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
