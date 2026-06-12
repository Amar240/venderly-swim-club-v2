import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const WEDGEWOOD_CLUB_ID = "9dd5014c-8c15-4959-869c-2f61dc80c8af";
const ADMIN_EMAIL = "admin@wedgewood.com";

const main = async (): Promise<void> => {
  const existing = await prisma.staff.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true }
  });

  if (existing) {
    console.log(`${ADMIN_EMAIL} already exists; no changes made.`);
    return;
  }

  await prisma.staff.create({
    data: {
      clubId: WEDGEWOOD_CLUB_ID,
      email: ADMIN_EMAIL,
      name: "Wedgewood Admin",
      role: "ADMIN",
      isActive: true,
      passwordHash: await bcrypt.hash("1234", 10)
    }
  });

  console.log(`${ADMIN_EMAIL} created.`);
};

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown seed failure";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
