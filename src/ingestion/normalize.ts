import { inferMapping } from "./mapping";
import { parseCsv } from "./parse";
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
): Omit<CanonicalMembership, "accountHolderName" | "email" | "phone" | "memberCount" | "persons"> & {
  email: string;
  phone: string;
  memberCount: number;
} => {
  const guestPasses = parseOptionalInteger(getScalar(row, scalar, "guestPasses"));
  const paymentAmount = parseOptionalNumber(getScalar(row, scalar, "paymentAmount"));
  const submittedAt = parseDateLoose(getScalar(row, scalar, "submittedAt"));

  return {
    email: getScalar(row, scalar, "email").toLowerCase(),
    phone: coercePhone(getScalar(row, scalar, "phone")),
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

export const ingestCsv = (text: string): IngestResult => {
  const { headers, rows } = parseCsv(text);
  const profiles = profileColumns(headers, rows);
  const mapping = inferMapping(headers, rows, profiles);
  const records = toRecords(headers, rows);
  const warnings: string[] = [];
  const memberships: CanonicalMembership[] = [];

  if (mapping.longGrouping) {
    for (const group of groupPeopleLong(records, mapping.longGrouping)) {
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
      memberships,
      droppedColumns: mapping.droppedColumns,
      warnings
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
    memberships,
    droppedColumns: mapping.droppedColumns,
    warnings
  };
};
