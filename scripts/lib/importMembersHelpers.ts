export type CsvRow = Record<string, string>;

export type TierMapping = {
  tier: string;
  maxMembers: number;
};

export type ParsedName = {
  firstName: string;
  lastName: string;
};

export type ParsedMember = ParsedName & {
  fullName: string;
  email?: string;
  phone?: string;
  age?: number;
  relationship: string;
};

export type Summary = {
  importedMemberships: number;
  importedPersons: number;
  skipped: number;
  skippedPending: number;
  skippedNonSuccess: number;
};

export type ImportOptions = {
  dryRun: boolean;
  upsert: boolean;
  skipPending: boolean;
};

export type DryRunTierSummary = {
  memberships: number;
  persons: number;
};

export type MembershipImportData = {
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

export const IMPORT_SOURCE = "csv_import_2026";
export const DEFAULT_CSV_PATH = "scripts/data/Wedgewood - Final.csv";
export const SEASON_START = new Date("2026-05-24T00:00:00.000Z");
export const SEASON_END = new Date("2026-09-30T00:00:00.000Z");
export const FREE_PASS_DRY_RUN_CUTOFF = new Date("2026-05-01T23:59:59.999Z");
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const KNOWN_AMOUNT_TIERS: Record<number, TierMapping> = {
  165: { tier: "Student", maxMembers: 1 },
  240: { tier: "Adult", maxMembers: 1 },
  290: { tier: "AdultPlusChild", maxMembers: 2 },
  340: { tier: "Family3", maxMembers: 3 },
  390: { tier: "Family4", maxMembers: 4 },
  430: { tier: "Family4", maxMembers: 4 },
  480: { tier: "Family5", maxMembers: 5 },
  530: { tier: "Family5", maxMembers: 5 },
  580: { tier: "FamilyPlus", maxMembers: 6 },
  730: { tier: "FamilyLarge", maxMembers: 8 }
};

export const parseArgs = (args: string[]): ImportOptions & { csvPath?: string } => {
  const dryRun = args.includes("--dry-run");
  const upsert = args.includes("--upsert");
  const skipPending = !args.includes("--include-pending");
  const csvPath = args.find((arg) => !arg.startsWith("--"));

  return { dryRun, upsert, skipPending, csvPath };
};

export const parseCsv = (content: string): CsvRow[] => {
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

export const getField = (row: CsvRow, fieldName: string): string => row[fieldName]?.trim() ?? "";

export const getFirstField = (row: CsvRow, fieldNames: string[]): string => {
  for (const fieldName of fieldNames) {
    const value = getField(row, fieldName);

    if (value) {
      return value;
    }
  }

  return "";
};

export const getMemberNameField = (row: CsvRow, index: number): string =>
  getFirstField(row, [`Member ${index} Name`, `Member ${index}`]);

export const getMemberPhoneField = (row: CsvRow, index: number): string => getField(row, `Member ${index} Phone`);

export const getRelationshipsField = (row: CsvRow): string =>
  getFirstField(row, ["All names and family relationships", "All names and family relationships on membership:"]);

export const getAllergiesField = (row: CsvRow): string =>
  getFirstField(row, [
    "Do you require any special accommodations?...",
    "Do you require any special accommodations? If so, please describe:",
    "Do you have any allergies, medical concerns, or require any special accommodations? If so, please describe:"
  ]);

export const normalizePaymentStatus = (status: string): string => status.trim().toLowerCase();

export const trimOrNull = (raw: string | undefined): string | null => {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
};

export const parseGhlDate = (raw: string): Date | null => {
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

export const parseBool = (raw: string | undefined): boolean => ["true", "yes", "1"].includes(raw?.trim().toLowerCase() ?? "");

export const splitMultivalue = (raw: string): string[] =>
  raw
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

export const parseName = (fullName: string): ParsedName => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const [firstName = "", ...lastNameParts] = parts;

  return {
    firstName,
    lastName: lastNameParts.join(" ")
  };
};

export const normalizeName = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

export const normalizeFirstName = (name: string): string => parseName(name).firstName.toLowerCase();

export const parseChildrenAges = (raw: string): Map<string, number> => {
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

export const parseRelationships = (raw: string): Map<string, string> => {
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

export const cleanPhoneNumber = (rawPhone: string): string | undefined => {
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

export const parsePaymentAmountCents = (amount: string): number => {
  const numeric = amount.replace(/[^0-9.]/g, "");
  const parsed = Number.parseFloat(numeric);

  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.round(parsed * 100);
};

export const tierFromMemberCount = (memberCount: number): TierMapping => {
  if (memberCount <= 1) {
    return { tier: "Adult", maxMembers: 1 };
  }

  if (memberCount === 2) {
    return { tier: "AdultPlusChild", maxMembers: 2 };
  }

  if (memberCount === 3) {
    return { tier: "Family3", maxMembers: 3 };
  }

  if (memberCount === 4) {
    return { tier: "Family4", maxMembers: 4 };
  }

  if (memberCount === 5) {
    return { tier: "Family5", maxMembers: 5 };
  }

  if (memberCount === 6) {
    return { tier: "FamilyPlus", maxMembers: 6 };
  }

  if (memberCount <= 8) {
    return { tier: "FamilyLarge", maxMembers: 8 };
  }

  return { tier: "FamilyLarge", maxMembers: 9 };
};

export const resolveTier = (amountDollars: number, memberCount: number): TierMapping => {
  const known = KNOWN_AMOUNT_TIERS[Math.round(amountDollars)];

  if (known) {
    return memberCount > known.maxMembers ? { tier: known.tier, maxMembers: memberCount } : known;
  }

  return tierFromMemberCount(memberCount);
};

export const parseFamilyMembers = (row: CsvRow, accountHolderName: string): ParsedMember[] => {
  const accountHolderNormalizedName = normalizeName(accountHolderName);
  const familyMembers: ParsedMember[] = [];
  const emails = splitMultivalue(getField(row, "Email addresses for all people on membership:"));
  const childAges = parseChildrenAges(getField(row, "Include name(s) & age(s) of your child/children:"));
  const relationships = parseRelationships(getRelationshipsField(row));

  for (let index = 1; index <= 9; index += 1) {
    const fullName = getMemberNameField(row, index);

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
      phone: cleanPhoneNumber(getMemberPhoneField(row, index)),
      age: childAges.get(firstNameKey),
      relationship: relationships.get(firstNameKey) ?? "family_member"
    });
  }

  return familyMembers;
};

export const formatFamilyNames = (familyMembers: ParsedMember[]): string =>
  familyMembers.map((member) => member.firstName).join(", ");

const addTierSummary = (
  tierSummaries: Map<string, DryRunTierSummary>,
  tier: string,
  personCount: number
): void => {
  const current = tierSummaries.get(tier) ?? { memberships: 0, persons: 0 };
  tierSummaries.set(tier, {
    memberships: current.memberships + 1,
    persons: current.persons + personCount
  });
};

const formatOptionalDate = (date: Date | null): string => (date ? date.toISOString() : "n/a");

export const printDryRunSummary = (rows: CsvRow[], options: ImportOptions): void => {
  const tierSummaries = new Map<string, DryRunTierSummary>();
  const weirdRows: string[] = [];
  let skippedPending = 0;
  let skippedNonSuccess = 0;
  let earliestSubmittedAt: Date | null = null;
  let latestSubmittedAt: Date | null = null;
  let freePassEligible = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const accountHolderName = getField(row, "Your Full Name");
    const paymentStatus = getField(row, "Payment Status");
    const normalizedPaymentStatus = normalizePaymentStatus(paymentStatus);

    if (normalizedPaymentStatus === "pending" && options.skipPending) {
      skippedPending += 1;
      return;
    }

    if (normalizedPaymentStatus !== "success" && normalizedPaymentStatus !== "pending") {
      skippedNonSuccess += 1;
      return;
    }

    const email = getField(row, "Your Email").toLowerCase();

    if (!EMAIL_PATTERN.test(email)) {
      weirdRows.push(`Row ${rowNumber}: missing or invalid email (${accountHolderName || "Unknown"})`);
      return;
    }

    if (!parseName(accountHolderName).firstName) {
      weirdRows.push(`Row ${rowNumber}: missing account holder name (${email})`);
      return;
    }

    const submittedAtRaw = getField(row, "Submission Date");
    const submittedAt = parseGhlDate(submittedAtRaw);

    if (submittedAtRaw && !submittedAt) {
      weirdRows.push(`Row ${rowNumber}: unparseable Submission Date "${submittedAtRaw}"`);
    }

    if (submittedAt) {
      earliestSubmittedAt =
        !earliestSubmittedAt || submittedAt < earliestSubmittedAt ? submittedAt : earliestSubmittedAt;
      latestSubmittedAt = !latestSubmittedAt || submittedAt > latestSubmittedAt ? submittedAt : latestSubmittedAt;

      if (submittedAt <= FREE_PASS_DRY_RUN_CUTOFF) {
        freePassEligible += 1;
      }
    }

    const familyMembers = parseFamilyMembers(row, accountHolderName);
    const personCount = 1 + familyMembers.length;
    const paymentAmountCents = parsePaymentAmountCents(getField(row, "Payment Amount"));
    const tierMapping = resolveTier(paymentAmountCents / 100, personCount);

    if (paymentAmountCents === 0) {
      weirdRows.push(
        `Row ${rowNumber}: missing/zero Payment Amount; resolved ${tierMapping.tier} from ${personCount} person(s)`
      );
    }

    addTierSummary(tierSummaries, tierMapping.tier, personCount);
  });

  console.log(`Total rows seen: ${rows.length}`);
  console.log(`Skipped pending rows: ${skippedPending}`);
  console.log(`Skipped non-success rows: ${skippedNonSuccess}`);
  console.log("By tier:");

  for (const [tier, summary] of [...tierSummaries.entries()].sort(([first], [second]) => first.localeCompare(second))) {
    console.log(`  ${tier}: ${summary.memberships} memberships, ${summary.persons} persons`);
  }

  console.log(
    `Submitted at range: ${formatOptionalDate(earliestSubmittedAt)} to ${formatOptionalDate(latestSubmittedAt)}`
  );
  console.log(`Rows with submitted_at <= 2026-05-01 23:59:59: ${freePassEligible}`);

  if (weirdRows.length > 0) {
    console.log("Rows with weird/unparseable data:");
    for (const warning of weirdRows) {
      console.log(`  - ${warning}`);
    }
  } else {
    console.log("Rows with weird/unparseable data: 0");
  }

  console.log("DRY RUN — no rows written to database.");
};
