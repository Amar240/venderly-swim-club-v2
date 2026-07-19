import type { ColumnProfile } from "./profile";
import {
  normalizeHeader,
  SCALAR_TARGET_FIELDS,
  type ScalarTargetField,
  SYNONYM_LOOKUP
} from "./synonyms";

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
  manualOverrides?: Record<string, ScalarTargetField | null>;
};

export const EDITABLE_MAPPING_TARGETS = SCALAR_TARGET_FIELDS;

export type EditableMappingTarget = ScalarTargetField;

export type MappingOverride = {
  sourceColumn: string;
  targetField: EditableMappingTarget | null;
};

export type MappingReviewMethod = "fuzzy" | "structural" | "manual" | "llm";

export type MappingSuggestion = {
  sourceColumn: string;
  targetField: ScalarTargetField | "ignore";
  confidence: number;
};

export type MappingReviewEntry = {
  sourceColumn: string;
  targetField: ScalarTargetField | string | null;
  confidence: number;
  method: MappingReviewMethod;
  sampleValues: string[];
  editable: boolean;
  groupKey?: string;
  groupLabel?: string;
  canToggleGroup?: boolean;
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

const cloneMappingPlan = (plan: MappingPlan): MappingPlan => ({
  scalar: { ...plan.scalar },
  actions: plan.actions.map((action) => ({ ...action })),
  wideMemberGroups: plan.wideMemberGroups.map((group) => ({ ...group })),
  ...(plan.longGrouping ? { longGrouping: { ...plan.longGrouping } } : {}),
  ...(plan.combinedPeopleColumn ? { combinedPeopleColumn: plan.combinedPeopleColumn } : {}),
  ...(plan.splitName ? { splitName: { ...plan.splitName } } : {}),
  ...(plan.combinedAddressColumn ? { combinedAddressColumn: plan.combinedAddressColumn } : {}),
  droppedColumns: [...plan.droppedColumns],
  manualOverrides: { ...plan.manualOverrides }
});

const scalarTargetForSource = (plan: MappingPlan, sourceColumn: string): ScalarTargetField | undefined =>
  (Object.entries(plan.scalar) as Array<[ScalarTargetField, string]>).find(([, source]) => source === sourceColumn)?.[0];

const isFamilySource = (plan: MappingPlan, sourceColumn: string): boolean => {
  const isWide = plan.wideMemberGroups.some((group) =>
    [group.nameColumn, group.ageColumn, group.phoneColumn].includes(sourceColumn)
  );
  const long = plan.longGrouping;
  const isLong = long
    ? [
        long.groupIdColumn,
        long.nameColumn,
        long.isPrimaryColumn,
        long.ageColumn,
        long.phoneColumn
      ].includes(sourceColumn)
    : false;

  return isWide || isLong || plan.combinedPeopleColumn === sourceColumn;
};

const removeScalarSource = (plan: MappingPlan, sourceColumn: string): void => {
  for (const [target, source] of Object.entries(plan.scalar) as Array<[ScalarTargetField, string]>) {
    if (source === sourceColumn) {
      delete plan.scalar[target];
    }
  }
};

const disableNonFamilyStructure = (plan: MappingPlan, sourceColumn: string): void => {
  if (plan.splitName && [plan.splitName.firstColumn, plan.splitName.lastColumn].includes(sourceColumn)) {
    delete plan.splitName;
  }

  if (plan.combinedAddressColumn === sourceColumn) {
    delete plan.combinedAddressColumn;
  }
};

const disableFamilyStructure = (plan: MappingPlan, sourceColumn: string): void => {
  if (plan.wideMemberGroups.some((group) =>
    [group.nameColumn, group.ageColumn, group.phoneColumn].includes(sourceColumn)
  )) {
    plan.wideMemberGroups = [];
  }

  if (plan.longGrouping && [
    plan.longGrouping.groupIdColumn,
    plan.longGrouping.nameColumn,
    plan.longGrouping.isPrimaryColumn,
    plan.longGrouping.ageColumn,
    plan.longGrouping.phoneColumn
  ].includes(sourceColumn)) {
    delete plan.longGrouping;
  }

  if (plan.combinedPeopleColumn === sourceColumn) {
    delete plan.combinedPeopleColumn;
  }
};

export const applyMappingOverrides = (
  plan: MappingPlan,
  headers: string[],
  overrides: MappingOverride[]
): MappingPlan => {
  const next = cloneMappingPlan(plan);

  for (const override of overrides) {
    if (!headers.includes(override.sourceColumn)) {
      throw new Error(`Unknown source column: ${override.sourceColumn}`);
    }

    const sourceIsFamily = isFamilySource(plan, override.sourceColumn);

    if (sourceIsFamily && override.targetField !== null) {
      throw new Error(`Family structure can only be included or ignored: ${override.sourceColumn}`);
    }

    removeScalarSource(next, override.sourceColumn);
    disableNonFamilyStructure(next, override.sourceColumn);
    next.droppedColumns = next.droppedColumns.filter((column) => column !== override.sourceColumn);

    if (sourceIsFamily) {
      disableFamilyStructure(next, override.sourceColumn);
    }

    if (override.targetField) {
      const displacedSource = next.scalar[override.targetField];
      if (displacedSource && displacedSource !== override.sourceColumn) {
        removeScalarSource(next, displacedSource);
        next.droppedColumns = [...new Set([...next.droppedColumns, displacedSource])];
        next.manualOverrides![displacedSource] = null;
      }
      next.scalar[override.targetField] = override.sourceColumn;
    } else {
      next.droppedColumns = [...new Set([...next.droppedColumns, override.sourceColumn])];
    }

    next.manualOverrides![override.sourceColumn] = override.targetField;
  }

  return next;
};

const distinctSamples = (rows: string[][], columnIndex: number): string[] => {
  const samples = new Set<string>();

  for (const row of rows) {
    const value = row[columnIndex]?.trim();
    if (value) {
      samples.add(value);
    }
    if (samples.size === 3) {
      break;
    }
  }

  return [...samples];
};

const structuralTarget = (
  plan: MappingPlan,
  sourceColumn: string
): Pick<MappingReviewEntry, "targetField" | "groupKey" | "groupLabel" | "canToggleGroup"> | null => {
  for (const group of plan.wideMemberGroups) {
    if ([group.nameColumn, group.ageColumn, group.phoneColumn].includes(sourceColumn)) {
      const fields = [group.nameColumn, group.ageColumn, group.phoneColumn].filter(Boolean).length;
      return {
        targetField: sourceColumn === group.nameColumn
          ? "familyMemberName"
          : sourceColumn === group.ageColumn
            ? "familyMemberAge"
            : "familyMemberPhone",
        groupKey: "family-wide",
        groupLabel: `Members 1 to ${plan.wideMemberGroups.length}, ${fields > 1 ? "names and details" : "names"}`,
        canToggleGroup: true
      };
    }
  }

  if (plan.longGrouping) {
    const longFields: Array<[string | undefined, string]> = [
      [plan.longGrouping.groupIdColumn, "householdId"],
      [plan.longGrouping.nameColumn, "familyMemberName"],
      [plan.longGrouping.isPrimaryColumn, "primaryMemberMarker"],
      [plan.longGrouping.ageColumn, "familyMemberAge"],
      [plan.longGrouping.phoneColumn, "familyMemberPhone"]
    ];
    const match = longFields.find(([source]) => source === sourceColumn);
    if (match) {
      return {
        targetField: match[1],
        groupKey: "family-long",
        groupLabel: "Household rows detected as grouped family members",
        canToggleGroup: true
      };
    }
  }

  if (plan.combinedPeopleColumn === sourceColumn) {
    return {
      targetField: "familyMembers",
      groupKey: "family-combined",
      groupLabel: "Family members detected in one combined column",
      canToggleGroup: true
    };
  }

  if (plan.splitName && [plan.splitName.firstColumn, plan.splitName.lastColumn].includes(sourceColumn)) {
    return {
      targetField: "accountHolderNamePart",
      groupKey: "holder-split-name",
      groupLabel: "Account holder name detected from first and last name",
      canToggleGroup: false
    };
  }

  if (plan.combinedAddressColumn === sourceColumn) {
    return {
      targetField: "combinedAddress",
      groupKey: "combined-address",
      groupLabel: "Combined address detected, not stored in this demo",
      canToggleGroup: false
    };
  }

  return null;
};

export const buildMappingReview = (
  headers: string[],
  rows: string[][],
  plan: MappingPlan
): MappingReviewEntry[] =>
  headers.map((sourceColumn, columnIndex) => {
    const manualTarget = plan.manualOverrides?.[sourceColumn];
    const scalarTarget = scalarTargetForSource(plan, sourceColumn);
    const structural = structuralTarget(plan, sourceColumn);
    const targetField = manualTarget !== undefined
      ? manualTarget
      : scalarTarget ?? structural?.targetField ?? null;
    const editable = structural === null;

    return {
      sourceColumn,
      targetField,
      confidence: manualTarget !== undefined
        ? 1
        : targetField === null && !plan.droppedColumns.includes(sourceColumn) ? 0 : 1,
      method: manualTarget !== undefined ? "manual" : scalarTarget ? "fuzzy" : "structural",
      sampleValues: distinctSamples(rows, columnIndex),
      editable,
      ...(structural?.groupKey ? { groupKey: structural.groupKey } : {}),
      ...(structural?.groupLabel ? { groupLabel: structural.groupLabel } : {}),
      ...(structural?.canToggleGroup !== undefined ? { canToggleGroup: structural.canToggleGroup } : {})
    };
  });

export const mergeMappingSuggestions = (
  mapping: MappingReviewEntry[],
  suggestions: MappingSuggestion[]
): MappingReviewEntry[] => {
  const occupiedTargets = new Set(
    mapping
      .map((entry) => entry.targetField)
      .filter((target): target is string => target !== null)
  );
  const suggestionBySource = new Map<string, MappingSuggestion>();

  for (const suggestion of suggestions) {
    if (suggestion.targetField !== "ignore" && occupiedTargets.has(suggestion.targetField)) {
      continue;
    }

    const entry = mapping.find((item) => item.sourceColumn === suggestion.sourceColumn);
    if (!entry || entry.targetField !== null || entry.groupKey) {
      continue;
    }

    suggestionBySource.set(suggestion.sourceColumn, suggestion);
    if (suggestion.targetField !== "ignore") {
      occupiedTargets.add(suggestion.targetField);
    }
  }

  return mapping.map((entry) => {
    const suggestion = suggestionBySource.get(entry.sourceColumn);
    if (!suggestion) {
      return entry;
    }

    return {
      ...entry,
      targetField: suggestion.targetField === "ignore" ? null : suggestion.targetField,
      confidence: suggestion.confidence,
      method: "llm",
      editable: true
    };
  });
};
