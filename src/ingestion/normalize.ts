import {
  applyMappingOverrides,
  buildMappingReview,
  inferMapping,
  type MappingOverride,
  type MappingPlan,
  type MappingReviewEntry
} from "./mapping";
import {
  parseCsv,
  parseXlsx,
  type HeaderSelection,
  type ParseTableOptions
} from "./parse";
import { profileColumns } from "./profile";
import type { ScalarTargetField } from "./synonyms";
import {
  coercePhone,
  coercePostal,
  groupPeopleLong,
  joinName,
  parseDateLoose,
  splitAddress,
  splitPeopleFromCell,
  splitPeopleWide,
  withAccountHolderPerson,
  type RowRecord
} from "./transforms";
import { canonicalMembershipSchema, type CanonicalMembership, type IngestResult } from "./types";

export type IngestStats = {
  totalRows: number;
  membershipsFound: number;
  peopleFound: number;
  validCount: number;
  invalidCount: number;
};

export type IngestAnalysis = {
  result: IngestResult;
  mapping: MappingReviewEntry[];
  mappingPlan: MappingPlan;
  stats: IngestStats;
};

type ParsedIngestFile = {
  headers: string[];
  rows: string[][];
  warnings: string[];
  structure: HeaderSelection;
};

export type IngestFileOptions = {
  headerRowIndex?: number;
  detectedBy?: "auto" | "manual";
};

export type IngestFileAnalysis = IngestAnalysis & {
  structure: HeaderSelection;
};

const toRecords = (headers: string[], rows: string[][]): RowRecord[] =>
  rows.map((row) =>
    headers.reduce<RowRecord>((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {})
  );

const get = (row: RowRecord, column: string | undefined): string => (column ? row[column]?.trim() ?? "" : "");

const textOrUndefined = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseOptionalInteger = (value: string): number | null | undefined => {
  const trimmed = value.trim().replace(/\.0$/, "");

  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed.replace(/[^0-9-]/g, ""), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parseOptionalNumber = (value: string): number | undefined => {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseFloat(trimmed.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getScalar = (row: RowRecord, scalar: Partial<Record<ScalarTargetField, string>>, field: ScalarTargetField): string =>
  get(row, scalar[field]);

const buildBaseMembership = (
  row: RowRecord,
  scalar: Partial<Record<ScalarTargetField, string>>,
  accountHolderName: string
): Omit<CanonicalMembership, "accountHolderName" | "memberCount" | "persons"> & {
  memberCount: number;
} => {
  const guestPasses = parseOptionalInteger(getScalar(row, scalar, "guestPasses"));
  const paymentAmount = parseOptionalNumber(getScalar(row, scalar, "paymentAmount"));
  const submittedAt = parseDateLoose(getScalar(row, scalar, "submittedAt"));
  const email = textOrUndefined(getScalar(row, scalar, "email").toLowerCase());
  const phone = textOrUndefined(coercePhone(getScalar(row, scalar, "phone")));

  return {
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    streetAddress: textOrUndefined(getScalar(row, scalar, "streetAddress")),
    city: textOrUndefined(getScalar(row, scalar, "city")),
    postalCode: textOrUndefined(coercePostal(getScalar(row, scalar, "postalCode"))),
    state: textOrUndefined(getScalar(row, scalar, "state")),
    country: textOrUndefined(getScalar(row, scalar, "country")),
    memberCount: parseOptionalInteger(getScalar(row, scalar, "memberCount")) ?? 1,
    guestPasses: guestPasses === undefined ? undefined : guestPasses,
    paymentAmount,
    orderId: textOrUndefined(getScalar(row, scalar, "orderId")),
    submittedAt: submittedAt || undefined,
    medicalNotes: textOrUndefined(getScalar(row, scalar, "medicalNotes"))
  };
};

const validateMembership = (
  candidate: CanonicalMembership,
  warnings: string[],
  context: string
): CanonicalMembership | null => {
  const parsed = canonicalMembershipSchema.safeParse(candidate);

  if (parsed.success) {
    return parsed.data;
  }

  warnings.push(`${context}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  return null;
};

const transformTable = (
  headers: string[],
  rows: string[][],
  mapping: MappingPlan
): { result: IngestResult; candidateCount: number } => {
  const records = toRecords(headers, rows);
  const warnings: string[] = [];
  const memberships: CanonicalMembership[] = [];

  if (mapping.longGrouping) {
    const groupedMemberships = groupPeopleLong(records, mapping.longGrouping);
    for (const group of groupedMemberships) {
      const primary = group.primaryRow;
      const accountHolderName = get(primary, mapping.longGrouping.nameColumn);
      const scalar = {
        email: mapping.longGrouping.emailColumn,
        phone: mapping.longGrouping.phoneColumn,
        memberCount: mapping.longGrouping.memberCountColumn,
        paymentAmount: mapping.longGrouping.paymentAmountColumn,
        submittedAt: mapping.longGrouping.submittedAtColumn
      };
      const base = buildBaseMembership(primary, scalar, accountHolderName);
      const candidate: CanonicalMembership = {
        ...base,
        accountHolderName,
        persons: group.people
      };
      const valid = validateMembership(candidate, warnings, `household ${group.groupId}`);

      if (valid) {
        memberships.push(valid);
      }
    }

    return {
      result: {
        memberships,
        droppedColumns: mapping.droppedColumns,
        warnings
      },
      candidateCount: groupedMemberships.length
    };
  }

  records.forEach((row, index) => {
    const accountHolderName = mapping.splitName
      ? joinName(get(row, mapping.splitName.firstColumn), get(row, mapping.splitName.lastColumn))
      : getScalar(row, mapping.scalar, "accountHolderName");
    const base = buildBaseMembership(row, mapping.scalar, accountHolderName);
    const addressParts = mapping.combinedAddressColumn ? splitAddress(get(row, mapping.combinedAddressColumn)) : {};
    const listedPeople =
      mapping.wideMemberGroups.length > 0
        ? splitPeopleWide(row, mapping.wideMemberGroups, accountHolderName)
        : mapping.combinedPeopleColumn
          ? splitPeopleFromCell(get(row, mapping.combinedPeopleColumn), accountHolderName)
          : [];
    const candidate: CanonicalMembership = {
      ...base,
      streetAddress: base.streetAddress ?? addressParts.streetAddress,
      city: base.city ?? addressParts.city,
      state: base.state ?? addressParts.state,
      country: base.country ?? addressParts.country,
      accountHolderName,
      persons: withAccountHolderPerson(accountHolderName, base.phone, listedPeople)
    };
    const valid = validateMembership(candidate, warnings, `row ${index + 2}`);

    if (valid) {
      memberships.push(valid);
    }
  });

  return {
    result: {
      memberships,
      droppedColumns: mapping.droppedColumns,
      warnings
    },
    candidateCount: records.length
  };
};

export const analyzeTable = (
  headers: string[],
  rows: string[][],
  overrides: MappingOverride[] = []
): IngestAnalysis => {
  const profiles = profileColumns(headers, rows);
  const inferred = inferMapping(headers, rows, profiles);
  const mappingPlan = overrides.length > 0
    ? applyMappingOverrides(inferred, headers, overrides)
    : inferred;
  const transformed = transformTable(headers, rows, mappingPlan);
  const validCount = transformed.result.memberships.length;

  return {
    result: transformed.result,
    mapping: buildMappingReview(headers, rows, mappingPlan),
    mappingPlan,
    stats: {
      totalRows: rows.length,
      membershipsFound: validCount,
      peopleFound: transformed.result.memberships.reduce(
        (sum, membership) => sum + membership.persons.length,
        0
      ),
      validCount,
      invalidCount: Math.max(0, transformed.candidateCount - validCount)
    }
  };
};

export const ingestTable = (headers: string[], rows: string[][]): IngestResult =>
  analyzeTable(headers, rows).result;

export const parseIngestFile = (
  input: Buffer | string,
  filename: string,
  options: IngestFileOptions = {}
): ParsedIngestFile => {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  const parseOptions: ParseTableOptions = {
    headerRowIndex: options.headerRowIndex,
    detectedBy: options.detectedBy,
    validateCandidate: (headers, rows) => analyzeTable(headers, rows).stats.validCount
  };

  if (extension === "csv") {
    const text = Buffer.isBuffer(input) ? input.toString("utf8") : input;
    return parseCsv(text, parseOptions);
  }

  if (extension === "xlsx" || extension === "xls") {
    if (!Buffer.isBuffer(input)) {
      throw new Error("Excel ingestion requires a file buffer.");
    }

    return parseXlsx(input, parseOptions);
  }

  if (extension === "numbers") {
    throw new Error("Apple Numbers files are not supported. Please export the spreadsheet to Excel (.xlsx) or CSV.");
  }

  throw new Error("Unsupported file type. Please upload a CSV or Excel (.xlsx/.xls) file.");
};

export const analyzeIngestFile = (
  input: Buffer | string,
  filename: string,
  overrides: MappingOverride[] = [],
  options: IngestFileOptions = {}
): IngestFileAnalysis => {
  const parsed = parseIngestFile(input, filename, options);
  const analysis = analyzeTable(parsed.headers, parsed.rows, overrides);
  return {
    ...analysis,
    structure: parsed.structure,
    result: {
      ...analysis.result,
      warnings: [...parsed.warnings, ...analysis.result.warnings]
    }
  };
};

export const ingestCsv = (text: string): IngestResult => {
  return analyzeIngestFile(text, "input.csv").result;
};

export const ingestFile = (
  input: Buffer | string,
  filename: string,
  overrides: MappingOverride[] = [],
  options: IngestFileOptions = {}
): IngestResult => analyzeIngestFile(input, filename, overrides, options).result;
