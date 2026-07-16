import type { ColumnProfile } from "./profile";
import { normalizeHeader, type ScalarTargetField, SYNONYM_LOOKUP } from "./synonyms";

export type MappingAction =
  | { sourceColumn: string; targetField: ScalarTargetField; confidence: number; method: "fuzzy" }
  | { sourceColumn: string; targetField: "drop_column"; confidence: number; method: "profile" | "junk" };

export type WideMemberGroup = {
  index: number;
  nameColumn: string;
  phoneColumn?: string;
  ageColumn?: string;
};

export type LongGroupingPlan = {
  groupIdColumn: string;
  nameColumn: string;
  isPrimaryColumn: string;
  ageColumn?: string;
  phoneColumn?: string;
  emailColumn?: string;
  memberCountColumn?: string;
  paymentAmountColumn?: string;
  submittedAtColumn?: string;
};

export type MappingPlan = {
  scalar: Partial<Record<ScalarTargetField, string>>;
  actions: MappingAction[];
  wideMemberGroups: WideMemberGroup[];
  longGrouping?: LongGroupingPlan;
  combinedPeopleColumn?: string;
  splitName?: { firstColumn: string; lastColumn: string };
  combinedAddressColumn?: string;
  droppedColumns: string[];
};

const KNOWN_JUNK_HEADERS = new Set([
  "termsandconditions",
  "timezone",
  "paymentstatus",
  "emailverified",
  "phoneverified",
  "internalid",
  "legacyflag"
]);

const headerByNormalized = (headers: string[], normalized: string): string | undefined =>
  headers.find((header) => normalizeHeader(header) === normalized);

const firstHeader = (headers: string[], normalizedCandidates: string[]): string | undefined => {
  for (const candidate of normalizedCandidates) {
    const header = headerByNormalized(headers, candidate);

    if (header) {
      return header;
    }
  }

  return undefined;
};

export const detectWideMemberGroups = (headers: string[]): WideMemberGroup[] => {
  const groups = new Map<number, WideMemberGroup>();
  const pattern = /^(\d+)(st|nd|rd|th) Member (Full Name|Phone|Age)$/i;

  for (const header of headers) {
    const match = header.match(pattern);

    if (!match) {
      continue;
    }

    const index = Number.parseInt(match[1] ?? "", 10);
    const field = match[3]?.toLowerCase();
    const group = groups.get(index) ?? { index, nameColumn: "" };

    if (field === "full name") {
      group.nameColumn = header;
    } else if (field === "phone") {
      group.phoneColumn = header;
    } else if (field === "age") {
      group.ageColumn = header;
    }

    groups.set(index, group);
  }

  return [...groups.values()].filter((group) => group.nameColumn).sort((first, second) => first.index - second.index);
};

const hasRepeatedValues = (columnIndex: number, rows: string[][]): boolean => {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const value = row[columnIndex]?.trim();

    if (!value) {
      continue;
    }

    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.values()].some((count) => count > 1);
};

export const detectLongGrouping = (headers: string[], rows: string[][]): LongGroupingPlan | undefined => {
  const groupIdColumn = firstHeader(headers, ["householdid", "membershipid", "familyid", "groupid"]);
  const nameColumn = firstHeader(headers, ["membername", "fullname", "name"]);
  const isPrimaryColumn = firstHeader(headers, ["isprimary", "primary", "accountholder"]);

  if (!groupIdColumn || !nameColumn || !isPrimaryColumn) {
    return undefined;
  }

  if (!hasRepeatedValues(headers.indexOf(groupIdColumn), rows)) {
    return undefined;
  }

  return {
    groupIdColumn,
    nameColumn,
    isPrimaryColumn,
    ageColumn: firstHeader(headers, ["age"]),
    phoneColumn: firstHeader(headers, ["phone", "yourphone", "mobile"]),
    emailColumn: firstHeader(headers, ["email", "youremail"]),
    memberCountColumn: firstHeader(headers, ["plansize", "members"]),
    paymentAmountColumn: firstHeader(headers, ["amountpaid", "paymentamount", "amt"]),
    submittedAtColumn: firstHeader(headers, ["signupdate", "submissiondate", "joined", "signup"])
  };
};

export const detectCombinedPeopleCell = (headers: string[], rows: string[][]): string | undefined => {
  for (const header of headers) {
    const normalized = normalizeHeader(header);

    if (!["familymembers", "members", "people", "persons"].includes(normalized)) {
      continue;
    }

    const index = headers.indexOf(header);
    const sampleValues = rows.map((row) => row[index] ?? "").filter((value) => value.includes("(") && /[;,]/.test(value));

    if (sampleValues.length > 0) {
      return header;
    }
  }

  return undefined;
};

export const detectSplitName = (headers: string[]): { firstColumn: string; lastColumn: string } | undefined => {
  const firstColumn = firstHeader(headers, ["firstname"]);
  const lastColumn = firstHeader(headers, ["lastname"]);

  return firstColumn && lastColumn ? { firstColumn, lastColumn } : undefined;
};

export const detectCombinedAddress = (headers: string[], rows: string[][]): string | undefined => {
  for (const header of headers) {
    const normalized = normalizeHeader(header);

    if (!["address", "fulladdress", "homeaddress"].includes(normalized)) {
      continue;
    }

    const index = headers.indexOf(header);
    const hasPlaceId = rows.some((row) => /ChIJ\w+/i.test(row[index] ?? ""));

    if (hasPlaceId || normalized === "fulladdress") {
      return header;
    }
  }

  return undefined;
};

export const inferMapping = (headers: string[], rows: string[][], profiles: ColumnProfile[]): MappingPlan => {
  const scalar: Partial<Record<ScalarTargetField, string>> = {};
  const actions: MappingAction[] = [];
  const droppedColumns = new Set<string>();
  const splitName = detectSplitName(headers);
  const combinedAddressColumn = detectCombinedAddress(headers, rows);

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    const targetField = SYNONYM_LOOKUP[normalized];

    if (targetField && !(targetField in scalar)) {
      if (combinedAddressColumn === header && targetField === "streetAddress") {
        continue;
      }

      scalar[targetField] = header;
      actions.push({ sourceColumn: header, targetField, confidence: 1, method: "fuzzy" });
    }
  }

  const profileByName = new Map(profiles.map((profile) => [profile.name, profile]));

  for (const header of headers) {
    const normalized = normalizeHeader(header).replace(/^_/, "");
    const profile = profileByName.get(header);
    const isUsed =
      Object.values(scalar).includes(header) ||
      splitName?.firstColumn === header ||
      splitName?.lastColumn === header ||
      combinedAddressColumn === header;

    if (isUsed) {
      continue;
    }

    if (profile?.inferredType === "empty" || KNOWN_JUNK_HEADERS.has(normalized)) {
      droppedColumns.add(header);
      actions.push({
        sourceColumn: header,
        targetField: "drop_column",
        confidence: 1,
        method: KNOWN_JUNK_HEADERS.has(normalized) ? "junk" : "profile"
      });
    }
  }

  return {
    scalar,
    actions,
    wideMemberGroups: detectWideMemberGroups(headers),
    longGrouping: detectLongGrouping(headers, rows),
    combinedPeopleColumn: detectCombinedPeopleCell(headers, rows),
    splitName,
    combinedAddressColumn,
    droppedColumns: [...droppedColumns]
  };
};
