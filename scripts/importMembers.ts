import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

type CsvRow = Record<string, string>;

type TierMapping = {
  tier: string;
  maxMembers: number;
};

type ParsedName = {
  firstName: string;
  lastName: string;
};

type ParsedMember = ParsedName & {
  fullName: string;
};

type Summary = {
  importedMemberships: number;
  importedPersons: number;
  skipped: number;
};

const prisma = new PrismaClient();

const IMPORT_SOURCE = "csv_import_2026";
const SEASON_START = new Date("2026-05-24T00:00:00.000Z");
const SEASON_END = new Date("2026-09-30T00:00:00.000Z");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseArgs = (args: string[]): { dryRun: boolean; csvPath?: string } => {
  const dryRun = args.includes("--dry-run");
  const csvPath = args.find((arg) => arg !== "--dry-run");

  return { dryRun, csvPath };
};

const parseCsv = (content: string): CsvRow[] => {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let insideQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === "\"") {
      if (insideQuotes && nextChar === "\"") {
        currentField += "\"";
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      currentRow.push(currentField);
      rows.push(currentRow);
      currentField = "";
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  const [headers, ...dataRows] = rows.filter((row) => row.some((field) => field.trim().length > 0));

  if (!headers) {
    return [];
  }

  return dataRows.map((row) =>
    headers.reduce<CsvRow>((record, header, index) => {
      record[header.trim()] = row[index]?.trim() ?? "";
      return record;
    }, {})
  );
};

const getField = (row: CsvRow, fieldName: string): string => row[fieldName]?.trim() ?? "";

const cleanPhoneNumber = (rawPhone: string): string | undefined => {
  const firstPhone = rawPhone
    .split(/[,\n;|]/)
    .map((value) => value.trim())
    .find((value) => value.length > 0);

  if (!firstPhone) {
    return undefined;
  }

  const digits = firstPhone.replace(/\D/g, "");
  const normalized = digits.slice(-10);
  return normalized.length === 10 ? normalized : undefined;
};

const parseName = (fullName: string): ParsedName => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const [firstName = "", ...lastNameParts] = parts;

  return {
    firstName,
    lastName: lastNameParts.join(" ")
  };
};

const normalizeName = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

const parsePaymentAmountCents = (amount: string): number => {
  const numeric = amount.replace(/[^0-9.]/g, "");
  const parsed = Number.parseFloat(numeric);

  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.round(parsed * 100);
};

const mapPaymentToTier = (paymentAmountCents: number): TierMapping => {
  const dollars = paymentAmountCents / 100;

  if (dollars >= 730) {
    return { tier: "FamilyLarge", maxMembers: 8 };
  }

  if (dollars >= 580) {
    return { tier: "FamilyPlus", maxMembers: 6 };
  }

  switch (dollars) {
    case 165:
      return { tier: "Student", maxMembers: 1 };
    case 240:
      return { tier: "Adult", maxMembers: 1 };
    case 290:
      return { tier: "AdultPlusChild", maxMembers: 2 };
    case 340:
      return { tier: "Family3", maxMembers: 3 };
    case 390:
    case 430:
      return { tier: "Family4", maxMembers: 4 };
    case 480:
    case 530:
      return { tier: "Family5", maxMembers: 5 };
    default:
      return { tier: "Unknown", maxMembers: 5 };
  }
};

const parseFamilyMembers = (row: CsvRow, accountHolderName: string): ParsedMember[] => {
  const accountHolderNormalizedName = normalizeName(accountHolderName);
  const familyMembers: ParsedMember[] = [];

  for (let index = 1; index <= 8; index += 1) {
    const fullName = getField(row, `Member ${index}`);

    if (!fullName || normalizeName(fullName) === accountHolderNormalizedName) {
      continue;
    }

    const parsedName = parseName(fullName);

    if (!parsedName.firstName) {
      continue;
    }

    familyMembers.push({
      ...parsedName,
      fullName
    });
  }

  return familyMembers;
};

const formatFamilyNames = (familyMembers: ParsedMember[]): string =>
  familyMembers.map((member) => member.firstName).join(", ");

const importRow = async (row: CsvRow, clubId: string, dryRun: boolean): Promise<Summary> => {
  const accountHolderName = getField(row, "Your Full Name");
  const paymentStatus = getField(row, "Payment Status");

  if (paymentStatus !== "Success") {
    console.log(`Skipped (${paymentStatus || "Unknown"}): ${accountHolderName || "Unknown"}`);
    return { importedMemberships: 0, importedPersons: 0, skipped: 1 };
  }

  const email = getField(row, "Your Email").toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    console.log(`Skipped (no email): ${accountHolderName || "Unknown"}`);
    return { importedMemberships: 0, importedPersons: 0, skipped: 1 };
  }

  const existingMembership = await prisma.membership.findFirst({
    where: {
      clubId,
      ghlContactId: email
    },
    select: { id: true }
  });

  if (existingMembership) {
    console.log(`Already exists: ${accountHolderName || email}`);
    return { importedMemberships: 0, importedPersons: 0, skipped: 1 };
  }

  const accountHolder = parseName(accountHolderName);

  if (!accountHolder.firstName) {
    console.log(`Skipped (missing name): ${email}`);
    return { importedMemberships: 0, importedPersons: 0, skipped: 1 };
  }

  const paymentAmountCents = parsePaymentAmountCents(getField(row, "Payment Amount"));
  const tierMapping = mapPaymentToTier(paymentAmountCents);
  const phone = cleanPhoneNumber(getField(row, "Mobile phone numbers for all people on membership:"));
  const emergencyContactPhone = cleanPhoneNumber(getField(row, "Emergency Contact Mobile Number"));
  const emergencyContactName = getField(row, "Emergency Contact Full Name") || undefined;
  const allergies = getField(row, "Do you require any special accommodations?...") || undefined;
  const familyMembers = parseFamilyMembers(row, accountHolderName);
  const personCount = 1 + familyMembers.length;

  if (!dryRun) {
    await prisma.$transaction(async (transaction) => {
      const membership = await transaction.membership.create({
        data: {
          clubId,
          tier: tierMapping.tier,
          maxMembers: tierMapping.maxMembers,
          paymentStatus: "paid",
          paymentAmountCents,
          source: IMPORT_SOURCE,
          startsAt: SEASON_START,
          endsAt: SEASON_END,
          ghlContactId: email
        },
        select: { id: true }
      });

      await transaction.person.create({
        data: {
          clubId,
          membershipId: membership.id,
          firstName: accountHolder.firstName,
          lastName: accountHolder.lastName,
          email,
          phone,
          isPrimary: true,
          relationship: "self",
          emergencyContactName,
          emergencyContactPhone,
          allergies
        }
      });

      for (const familyMember of familyMembers) {
        await transaction.person.create({
          data: {
            clubId,
            membershipId: membership.id,
            firstName: familyMember.firstName,
            lastName: familyMember.lastName,
            isPrimary: false,
            relationship: "family_member"
          }
        });
      }
    });
  }

  const familyNames = formatFamilyNames(familyMembers);
  console.log(`Imported: ${accountHolderName}${familyNames ? ` (family: ${familyNames})` : ""}`);

  return { importedMemberships: 1, importedPersons: personCount, skipped: 0 };
};

const main = async (): Promise<void> => {
  const { dryRun, csvPath } = parseArgs(process.argv.slice(2));

  if (!csvPath) {
    throw new Error("Usage: npm run import:members -- [--dry-run] ./data/members.csv");
  }

  const ghlLocationId = process.env.GHL_LOCATION_ID;

  if (!ghlLocationId) {
    throw new Error("GHL_LOCATION_ID is required");
  }

  const club = await prisma.club.findFirst({
    where: {
      ghlLocationId,
      isActive: true
    },
    select: { id: true, name: true }
  });

  if (!club) {
    throw new Error(`No active club found for GHL_LOCATION_ID=${ghlLocationId}`);
  }

  const csvContent = await readFile(csvPath, "utf8");
  const rows = parseCsv(csvContent);
  const summary: Summary = { importedMemberships: 0, importedPersons: 0, skipped: 0 };

  console.log(`${dryRun ? "Dry run: " : ""}Importing ${rows.length} rows for ${club.name}`);

  for (const row of rows) {
    try {
      const rowSummary = await importRow(row, club.id, dryRun);
      summary.importedMemberships += rowSummary.importedMemberships;
      summary.importedPersons += rowSummary.importedPersons;
      summary.skipped += rowSummary.skipped;
    } catch (error) {
      const accountHolderName = getField(row, "Your Full Name") || "Unknown";
      const message = error instanceof Error ? error.message : "Unknown error";
      summary.skipped += 1;
      console.log(`Error importing ${accountHolderName}: ${message}`);
    }
  }

  console.log(
    `Done. Imported ${summary.importedMemberships} memberships, ${summary.importedPersons} persons. ${summary.skipped} skipped.`
  );
};

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown import failure";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
