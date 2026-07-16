import { normalizeName, splitFullName } from "../handlers/signup";
import type { LongGroupingPlan, WideMemberGroup } from "./mapping";
import type { CanonicalPerson } from "./types";

export type RowRecord = Record<string, string>;

export type SplitAddressResult = {
  streetAddress?: string;
  city?: string;
  state?: string;
  country?: string;
};

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11
};

const stripTrailingDecimalZero = (value: string): string => value.trim().replace(/\.0$/, "");

const optionalNumber = (value: string | undefined): number | null | undefined => {
  const cleaned = stripTrailingDecimalZero(value ?? "");

  if (!cleaned) {
    return null;
  }

  const parsed = Number.parseInt(cleaned.replace(/[^0-9-]/g, ""), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const coercePhone = (value: string): string => {
  const cleaned = stripTrailingDecimalZero(value);
  const digits = cleaned.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length > 11) {
    return `+1${digits.slice(-10)}`;
  }

  return "";
};

export const coercePostal = (value: string): string => stripTrailingDecimalZero(value);

export const parseDateLoose = (value: string): string => {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoDate) {
    const [, year, month, day] = isoDate;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0)).toISOString();
  }

  const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (slashDate) {
    const [, month, day, year] = slashDate;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0)).toISOString();
  }

  const textDate = trimmed.match(
    /^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:,\s+(\d{1,2}):(\d{2})\s*(am|pm))?$/i
  );

  if (textDate) {
    const [, monthName, day, year, hourRaw, minuteRaw, meridiemRaw] = textDate;
    const month = MONTH_INDEX[monthName.toLowerCase()];

    if (month === undefined) {
      return "";
    }

    let hour = hourRaw ? Number(hourRaw) : 12;
    const minute = minuteRaw ? Number(minuteRaw) : 0;
    const meridiem = meridiemRaw?.toLowerCase();

    if (meridiem === "pm" && hour < 12) {
      hour += 12;
    } else if (meridiem === "am" && hour === 12) {
      hour = 0;
    }

    return new Date(Date.UTC(Number(year), month, Number(day), hour, minute, 0, 0)).toISOString();
  }

  return "";
};

export const joinName = (first: string, last: string): string => `${first.trim()} ${last.trim()}`.trim();

const personFromName = (
  fullName: string,
  age?: number | null,
  phone?: string,
  isPrimary = false
): CanonicalPerson | null => {
  const trimmed = fullName.trim();

  if (!trimmed) {
    return null;
  }

  return {
    fullName: trimmed,
    isPrimary,
    ...(age !== undefined ? { age } : {}),
    ...(phone ? { phone } : {})
  };
};

export const dedupeHolderFromListedPeople = (
  accountHolderName: string,
  listedPeople: CanonicalPerson[]
): CanonicalPerson[] => {
  const holderKey = normalizeName(accountHolderName);
  return listedPeople.filter((person) => normalizeName(person.fullName) !== holderKey);
};

export const withAccountHolderPerson = (
  accountHolderName: string,
  holderPhone: string,
  listedPeople: CanonicalPerson[]
): CanonicalPerson[] => {
  const holder = personFromName(accountHolderName, null, holderPhone, true);
  const deduped = dedupeHolderFromListedPeople(accountHolderName, listedPeople).map((person) => ({
    ...person,
    isPrimary: false
  }));
  return holder ? [holder, ...deduped] : deduped;
};

export const splitPeopleWide = (row: RowRecord, groups: WideMemberGroup[], accountHolderName = ""): CanonicalPerson[] => {
  const people = groups
    .map((group) => {
      const age = optionalNumber(row[group.ageColumn ?? ""]);
      const phone = group.phoneColumn ? coercePhone(row[group.phoneColumn] ?? "") : "";
      return personFromName(row[group.nameColumn] ?? "", age, phone || undefined, false);
    })
    .filter((person): person is CanonicalPerson => person !== null);

  return accountHolderName ? dedupeHolderFromListedPeople(accountHolderName, people) : people;
};

export const splitPeopleFromCell = (cell: string, accountHolderName = ""): CanonicalPerson[] => {
  const people = cell
    .split(/[;\n]|,(?=\s*[A-Z])/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const match = segment.match(/^(.+?)(?:\s*\((\d{1,3})\))?$/);
      const name = match?.[1]?.trim() ?? "";
      const age = match?.[2] ? Number.parseInt(match[2], 10) : undefined;
      return personFromName(name, age, undefined, false);
    })
    .filter((person): person is CanonicalPerson => person !== null);

  return accountHolderName ? dedupeHolderFromListedPeople(accountHolderName, people) : people;
};

export type LongGroupedMembership = {
  groupId: string;
  primaryRow: RowRecord;
  people: CanonicalPerson[];
};

const isPrimaryValue = (value: string): boolean => ["yes", "true", "1", "primary", "y"].includes(value.trim().toLowerCase());

export const groupPeopleLong = (rows: RowRecord[], mapping: LongGroupingPlan): LongGroupedMembership[] => {
  const grouped = new Map<string, RowRecord[]>();

  for (const row of rows) {
    const groupId = row[mapping.groupIdColumn]?.trim();

    if (!groupId) {
      continue;
    }

    grouped.set(groupId, [...(grouped.get(groupId) ?? []), row]);
  }

  return [...grouped.entries()].map(([groupId, groupRows]) => {
    const primaryRow =
      groupRows.find((row) => isPrimaryValue(row[mapping.isPrimaryColumn] ?? "")) ?? groupRows[0] ?? {};
    const accountHolderName = primaryRow[mapping.nameColumn] ?? "";
    const people = groupRows
      .map((row) => {
        const age = optionalNumber(row[mapping.ageColumn ?? ""]);
        const phone = mapping.phoneColumn ? coercePhone(row[mapping.phoneColumn] ?? "") : "";
        const fullName = row[mapping.nameColumn] ?? "";
        const isPrimary = row === primaryRow;
        return personFromName(fullName, age, phone || undefined, isPrimary);
      })
      .filter((person): person is CanonicalPerson => person !== null);

    return {
      groupId,
      primaryRow,
      people: [
        ...people.filter((person) => person.isPrimary),
        ...people.filter((person) => !person.isPrimary)
      ]
    };
  });
};

export const splitAddress = (combined: string): SplitAddressResult => {
  const withoutPlaceId = combined.replace(/\s+ChIJ\w+.*$/i, "").trim();
  const parts = withoutPlaceId.split(",").map((part) => part.trim()).filter(Boolean);

  if (parts.length === 0) {
    return {};
  }

  const [streetAddress, city, state, country] = parts;
  return {
    ...(streetAddress ? { streetAddress } : {}),
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
    ...(country ? { country } : {})
  };
};

export const splitName = splitFullName;
