import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { calculateInitialGuestPasses } from "../src/lib/guestPasses";

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
  email?: string;
  age?: number;
  relationship: string;
};

type Summary = {
  importedMemberships: number;
  importedPersons: number;
  skipped: number;
};

type ImportOptions = {
  dryRun: boolean;
  upsert: boolean;
};

type MembershipImportData = {
  clubId: string;
  tier: string;
  maxMembers: number;
  paymentStatus: string;
  paymentAmountCents: number;
  source: string;
  startsAt: Date;
  endsAt: Date;
  ghlContactId: string;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  submittedAt: Date | null;
  externalOrderId: string | null;
  signupIp: string | null;
  signupTimezone: string | null;
  signupUrl: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  guestPassesTotal: number;
};

const prisma = new PrismaClient();

const IMPORT_SOURCE = "csv_import_2026";
const SEASON_START = new Date("2026-05-24T00:00:00.000Z");
const SEASON_END = new Date("2026-09-30T00:00:00.000Z");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseArgs = (args: string[]): ImportOptions & { csvPath?: string } => {
  const dryRun = args.includes("--dry-run");
  const upsert = args.includes("--upsert");
  const csvPath = args.find((arg) => !arg.startsWith("--"));

  return { dryRun, upsert, csvPath };
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

const trimOrNull = (raw: string | undefined): string | null => {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
};

const parseGhlDate = (raw: string): Date | null => {
  if (!raw.trim()) {
    return null;
  }

  try {
    const cleaned = raw.trim().replace(/(\d+)(st|nd|rd|th)/gi, "$1");
    const parsed = new Date(cleaned);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
};

const parseBool = (raw: string): boolean => ["true", "yes", "1"].includes(raw.trim().toLowerCase());

const splitMultivalue = (raw: string): string[] =>
  raw
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

const parseName = (fullName: string): ParsedName => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const [firstName = "", ...lastNameParts] = parts;

  return {
    firstName,
    lastName: lastNameParts.join(" ")
  };
};

const normalizeName = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

const normalizeFirstName = (name: string): string => parseName(name).firstName.toLowerCase();

const parseChildrenAges = (raw: string): Map<string, number> => {
  const ages = new Map<string, number>();
  const pattern = /([A-Za-z][A-Za-z .'-]*?)\s*\((\d{1,2})\)/g;

  for (const match of raw.matchAll(pattern)) {
    const name = match[1]?.trim();
    const age = Number.parseInt(match[2] ?? "", 10);
    const key = name ? normalizeFirstName(name) : "";

    if (key && !Number.isNaN(age)) {
      ages.set(key, age);
    }
  }

  return ages;
};

const parseRelationships = (raw: string): Map<string, string> => {
  const relationships = new Map<string, string>();

  for (const segment of splitMultivalue(raw)) {
    const [relationshipRaw, namesRaw] = segment.split(":");

    if (!relationshipRaw || !namesRaw) {
      continue;
    }

    const relationship = relationshipRaw.trim().toLowerCase().replace(/\s+/g, "_");
    const names = namesRaw
      .split(/\band\b|&|\//i)
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    for (const name of names) {
      const key = normalizeFirstName(name);

      if (key) {
        relationships.set(key, relationship);
      }
    }
  }

  return relationships;
};

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
  const emails = splitMultivalue(getField(row, "Email addresses for all people on membership:"));
  const childAges = parseChildrenAges(getField(row, "Include name(s) & age(s) of your child/children:"));
  const relationships = parseRelationships(getField(row, "All names and family relationships"));

  for (let index = 1; index <= 8; index += 1) {
    const fullName = getField(row, `Member ${index}`);

    if (!fullName || normalizeName(fullName) === accountHolderNormalizedName) {
      continue;
    }

    const parsedName = parseName(fullName);

    if (!parsedName.firstName) {
      continue;
    }

    const firstNameKey = normalizeFirstName(fullName);

    familyMembers.push({
      ...parsedName,
      fullName,
      email: emails[familyMembers.length],
      age: childAges.get(firstNameKey),
      relationship: relationships.get(firstNameKey) ?? "family_member"
    });
  }

  return familyMembers;
};

const formatFamilyNames = (familyMembers: ParsedMember[]): string =>
  familyMembers.map((member) => member.firstName).join(", ");

const findExistingMembership = async (clubId: string, email: string, externalOrderId: string | null): Promise<{ id: string } | null> => {
  if (externalOrderId) {
    const byOrderId = await prisma.membership.findUnique({
      where: {
        clubId_externalOrderId: {
          clubId,
          externalOrderId
        }
      },
      select: { id: true }
    });

    if (byOrderId) {
      return byOrderId;
    }
  }

  return prisma.membership.findFirst({
    where: {
      clubId,
      ghlContactId: email
    },
    select: { id: true }
  });
};

const importRow = async (row: CsvRow, clubId: string, options: ImportOptions): Promise<Summary> => {
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

  const submittedAt = parseGhlDate(getField(row, "Submission Date"));
  const externalOrderId = trimOrNull(getField(row, "Order Id"));
  const existingMembership = await findExistingMembership(clubId, email, externalOrderId);

  if (existingMembership && !options.upsert) {
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
  const emergencyContactName = trimOrNull(getField(row, "Emergency Contact Full Name"));
  const emergencyContactEmail = trimOrNull(getField(row, "Emergency Contact Email"));
  const allergies = trimOrNull(getField(row, "Do you require any special accommodations?..."));
  const familyMembers = parseFamilyMembers(row, accountHolderName);
  const personCount = 1 + familyMembers.length;
  const membershipData: MembershipImportData = {
    clubId,
    tier: tierMapping.tier,
    maxMembers: tierMapping.maxMembers,
    paymentStatus: "paid",
    paymentAmountCents,
    source: IMPORT_SOURCE,
    startsAt: SEASON_START,
    endsAt: SEASON_END,
    ghlContactId: email,
    addressStreet: trimOrNull(getField(row, "Street Address")),
    addressCity: trimOrNull(getField(row, "City")),
    addressState: trimOrNull(getField(row, "State")),
    addressPostalCode: trimOrNull(getField(row, "Postal Code")),
    addressCountry: trimOrNull(getField(row, "Country")),
    submittedAt,
    externalOrderId,
    signupIp: trimOrNull(getField(row, "IP")),
    signupTimezone: trimOrNull(getField(row, "Timezone")),
    signupUrl: trimOrNull(getField(row, "URL")),
    emailVerified: parseBool(getField(row, "Email Verified")),
    phoneVerified: parseBool(getField(row, "Phone Verified")),
    guestPassesTotal: calculateInitialGuestPasses(submittedAt)
  };

  if (!options.dryRun) {
    await prisma.$transaction(async (transaction) => {
      const membership = existingMembership
        ? await transaction.membership.update({
            where: { id: existingMembership.id },
            data: membershipData,
            select: { id: true }
          })
        : await transaction.membership.create({
            data: membershipData,
            select: { id: true }
          });

      const existingPrimaryByContact = await transaction.person.findUnique({
        where: {
          clubId_ghlContactId: {
            clubId,
            ghlContactId: email
          }
        },
        select: { id: true }
      });
      const existingPrimary =
        existingPrimaryByContact ??
        (await transaction.person.findFirst({
          where: {
            clubId,
            membershipId: membership.id,
            isPrimary: true
          },
          select: { id: true }
        }));
      const primaryData = {
        clubId,
        membershipId: membership.id,
        firstName: accountHolder.firstName,
        lastName: accountHolder.lastName,
        email,
        phone,
        ghlContactId: email,
        isPrimary: true,
        relationship: "self",
        emergencyContactName,
        emergencyContactPhone,
        emergencyContactEmail,
        allergies
      };

      if (existingPrimary) {
        await transaction.person.update({
          where: { id: existingPrimary.id },
          data: primaryData
        });
      } else {
        await transaction.person.create({ data: primaryData });
      }

      const existingFamilyPersons = await transaction.person.findMany({
        where: {
          clubId,
          membershipId: membership.id,
          isPrimary: false
        },
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      });

      for (const familyMember of familyMembers) {
        const normalizedFamilyName = normalizeName(`${familyMember.firstName} ${familyMember.lastName}`);
        const existingFamilyPerson = existingFamilyPersons.find(
          (person) => normalizeName(`${person.firstName} ${person.lastName}`) === normalizedFamilyName
        );
        const familyData = {
          clubId,
          membershipId: membership.id,
          firstName: familyMember.firstName,
          lastName: familyMember.lastName,
          email: familyMember.email,
          age: familyMember.age,
          isPrimary: false,
          relationship: familyMember.relationship,
          emergencyContactName,
          emergencyContactPhone,
          emergencyContactEmail,
          allergies
        };

        if (existingFamilyPerson) {
          await transaction.person.update({
            where: { id: existingFamilyPerson.id },
            data: familyData
          });
        } else {
          await transaction.person.create({ data: familyData });
        }
      }
    });
  }

  const familyNames = formatFamilyNames(familyMembers);
  const action = existingMembership && options.upsert ? "Updated" : "Imported";
  console.log(`${action}: ${accountHolderName}${familyNames ? ` (family: ${familyNames})` : ""}`);

  return { importedMemberships: existingMembership && options.upsert ? 0 : 1, importedPersons: personCount, skipped: 0 };
};

const main = async (): Promise<void> => {
  const { dryRun, upsert, csvPath } = parseArgs(process.argv.slice(2));

  if (!csvPath) {
    throw new Error("Usage: npm run import:members -- [--dry-run] [--upsert] ./data/members.csv");
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

  console.log(`${dryRun ? "Dry run: " : ""}${upsert ? "Upsert mode: " : ""}Importing ${rows.length} rows for ${club.name}`);

  for (const row of rows) {
    try {
      const rowSummary = await importRow(row, club.id, { dryRun, upsert });
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
