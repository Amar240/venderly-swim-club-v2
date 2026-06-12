import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { calculateInitialGuestPasses } from "../src/lib/guestPasses";
import {
  DEFAULT_CSV_PATH,
  EMAIL_PATTERN,
  IMPORT_SOURCE,
  SEASON_END,
  SEASON_START,
  cleanPhoneNumber,
  formatFamilyNames,
  getAllergiesField,
  getField,
  normalizeName,
  normalizePaymentStatus,
  parseArgs,
  parseBool,
  parseCsv,
  parseFamilyMembers,
  parseGhlDate,
  parseName,
  parsePaymentAmountCents,
  printDryRunSummary,
  resolveTier,
  trimOrNull,
  type CsvRow,
  type ImportOptions,
  type MembershipImportData,
  type Summary
} from "./lib/importMembersHelpers";

const prisma = new PrismaClient();

const findExistingMembership = async (
  clubId: string,
  email: string,
  externalOrderId: string | null
): Promise<{ id: string } | null> => {
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
  const normalizedPaymentStatus = normalizePaymentStatus(paymentStatus);

  if (normalizedPaymentStatus === "pending" && options.skipPending) {
    console.log(`Skipped (Pending): ${accountHolderName || "Unknown"}`);
    return { importedMemberships: 0, importedPersons: 0, skipped: 1, skippedPending: 1, skippedNonSuccess: 0 };
  }

  if (normalizedPaymentStatus !== "success" && normalizedPaymentStatus !== "pending") {
    console.log(`Skipped (${paymentStatus || "Unknown"}): ${accountHolderName || "Unknown"}`);
    return { importedMemberships: 0, importedPersons: 0, skipped: 1, skippedPending: 0, skippedNonSuccess: 1 };
  }

  const email = getField(row, "Your Email").toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    console.log(`Skipped (no email): ${accountHolderName || "Unknown"}`);
    return { importedMemberships: 0, importedPersons: 0, skipped: 1, skippedPending: 0, skippedNonSuccess: 0 };
  }

  const submittedAt = parseGhlDate(getField(row, "Submission Date"));
  const externalOrderId = trimOrNull(getField(row, "Order Id"));
  const existingMembership = await findExistingMembership(clubId, email, externalOrderId);

  if (existingMembership && !options.upsert) {
    console.log(`Already exists: ${accountHolderName || email}`);
    return { importedMemberships: 0, importedPersons: 0, skipped: 1, skippedPending: 0, skippedNonSuccess: 0 };
  }

  const accountHolder = parseName(accountHolderName);

  if (!accountHolder.firstName) {
    console.log(`Skipped (missing name): ${email}`);
    return { importedMemberships: 0, importedPersons: 0, skipped: 1, skippedPending: 0, skippedNonSuccess: 0 };
  }

  const paymentAmountCents = parsePaymentAmountCents(getField(row, "Payment Amount"));
  const phone = cleanPhoneNumber(getField(row, "Mobile phone numbers for all people on membership:"));
  const emergencyContactPhone = cleanPhoneNumber(getField(row, "Emergency Contact Mobile Number"));
  const emergencyContactName = trimOrNull(getField(row, "Emergency Contact Full Name"));
  const emergencyContactEmail = trimOrNull(getField(row, "Emergency Contact Email"));
  const allergies = trimOrNull(getAllergiesField(row));
  const familyMembers = parseFamilyMembers(row, accountHolderName);
  const personCount = 1 + familyMembers.length;
  const tierMapping = resolveTier(paymentAmountCents / 100, personCount);
  const membershipData: MembershipImportData = {
    clubId,
    tier: tierMapping.tier,
    maxMembers: tierMapping.maxMembers,
    paymentStatus: normalizedPaymentStatus === "pending" ? "pending" : "paid",
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
          phone: familyMember.phone,
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

  return {
    importedMemberships: existingMembership && options.upsert ? 0 : 1,
    importedPersons: personCount,
    skipped: 0,
    skippedPending: 0,
    skippedNonSuccess: 0
  };
};

const main = async (): Promise<void> => {
  const { dryRun, upsert, skipPending, csvPath } = parseArgs(process.argv.slice(2));
  const resolvedCsvPath = csvPath ?? DEFAULT_CSV_PATH;

  const csvContent = await readFile(resolvedCsvPath, "utf8");
  const rows = parseCsv(csvContent);

  if (dryRun) {
    console.log(`Dry run: analyzing ${rows.length} rows from ${resolvedCsvPath}`);
    printDryRunSummary(rows, { dryRun, upsert, skipPending });
    return;
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

  const summary: Summary = {
    importedMemberships: 0,
    importedPersons: 0,
    skipped: 0,
    skippedPending: 0,
    skippedNonSuccess: 0
  };

  console.log(`${upsert ? "Upsert mode: " : ""}Importing ${rows.length} rows from ${resolvedCsvPath} for ${club.name}`);

  for (const row of rows) {
    try {
      const rowSummary = await importRow(row, club.id, { dryRun, upsert, skipPending });
      summary.importedMemberships += rowSummary.importedMemberships;
      summary.importedPersons += rowSummary.importedPersons;
      summary.skipped += rowSummary.skipped;
      summary.skippedPending += rowSummary.skippedPending;
      summary.skippedNonSuccess += rowSummary.skippedNonSuccess;
    } catch (error) {
      const accountHolderName = getField(row, "Your Full Name") || "Unknown";
      const message = error instanceof Error ? error.message : "Unknown error";
      summary.skipped += 1;
      console.log(`Error importing ${accountHolderName}: ${message}`);
    }
  }

  if (skipPending) {
    console.log(`Skipped ${summary.skippedPending} pending rows`);
  }

  if (summary.skippedNonSuccess > 0) {
    console.log(`Skipped ${summary.skippedNonSuccess} non-success rows`);
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
