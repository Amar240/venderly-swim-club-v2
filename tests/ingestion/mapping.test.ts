import { describe, expect, it } from "vitest";
import {
  aiMappingOverrides,
  applyMappingOverrides,
  buildMappingReview,
  inferMapping,
  mergeMappingSuggestions
} from "../../src/ingestion/mapping";
import { profileColumns } from "../../src/ingestion/profile";
import { SCALAR_TARGET_FIELDS } from "../../src/ingestion/synonyms";

const headers = [
  "Your Full Name",
  "Select the # of Members for your Membership",
  "Guest Passes",
  "Payment Amount",
  "Your Email",
  "Mystery Balance",
  "1st Member Full Name",
  "1st Member Age"
];

const rows = [[
  "Caleb Lewis",
  "3",
  "5",
  "340",
  "caleb@example.com",
  "8",
  "Kevin Lewis",
  "12"
]];

const plan = () => inferMapping(headers, rows, profileColumns(headers, rows));

describe("applyMappingOverrides", () => {
  it("reassigns an unknown column to an editable scalar target", () => {
    const updated = applyMappingOverrides(plan(), headers, [
      { sourceColumn: "Mystery Balance", targetField: "guestPasses" }
    ]);

    expect(updated.scalar.guestPasses).toBe("Mystery Balance");
    expect(updated.droppedColumns).toContain("Guest Passes");
  });

  it("ignores an editable scalar column", () => {
    const updated = applyMappingOverrides(plan(), headers, [
      { sourceColumn: "Payment Amount", targetField: null }
    ]);

    expect(updated.scalar.paymentAmount).toBeUndefined();
    expect(updated.droppedColumns).toContain("Payment Amount");
  });

  it("replaces a target and records the displaced source as ignored", () => {
    const updated = applyMappingOverrides(plan(), headers, [
      { sourceColumn: "Payment Amount", targetField: "memberCount" }
    ]);

    expect(updated.scalar.memberCount).toBe("Payment Amount");
    expect(updated.droppedColumns).toContain("Select the # of Members for your Membership");
  });

  it("disables a detected family group as one structural override", () => {
    const updated = applyMappingOverrides(plan(), headers, [
      { sourceColumn: "1st Member Full Name", targetField: null }
    ]);

    expect(updated.wideMemberGroups).toEqual([]);
  });

  it("allows a detected non-family field to be redirected or ignored", () => {
    const ignored = applyMappingOverrides(plan(), headers, [
      { sourceColumn: "Your Email", targetField: null }
    ]);
    const redirected = applyMappingOverrides(plan(), headers, [
      { sourceColumn: "Your Email", targetField: "guestPasses" }
    ]);

    expect(ignored.scalar.email).toBeUndefined();
    expect(ignored.droppedColumns).toContain("Your Email");
    expect(redirected.scalar.guestPasses).toBe("Your Email");
  });

  it("rejects source columns that are not present", () => {
    expect(() => applyMappingOverrides(plan(), headers, [
      { sourceColumn: "Missing Column", targetField: "guestPasses" }
    ])).toThrow("Unknown source column");
  });

  it("accepts every canonical scalar target", () => {
    for (const targetField of SCALAR_TARGET_FIELDS) {
      const updated = applyMappingOverrides(plan(), headers, [
        { sourceColumn: "Mystery Balance", targetField }
      ]);

      expect(updated.scalar[targetField]).toBe("Mystery Balance");
    }
  });
});

describe("mergeMappingSuggestions", () => {
  it("marks unresolved suggestions as llm mappings", () => {
    const review = buildMappingReview(headers, rows, plan()).map((entry) =>
      entry.sourceColumn === "Guest Passes"
        ? { ...entry, targetField: null, confidence: 0 }
        : entry
    );
    const merged = mergeMappingSuggestions(review, [{
      sourceColumn: "Mystery Balance",
      targetField: "guestPasses",
      confidence: 0.91
    }]);

    expect(merged.find((entry) => entry.sourceColumn === "Mystery Balance")).toMatchObject({
      targetField: "guestPasses",
      method: "llm",
      confidence: 0.91,
      editable: true
    });
  });

  it("does not replace a deterministic target or structural mapping", () => {
    const review = buildMappingReview(headers, rows, plan());
    const merged = mergeMappingSuggestions(review, [
      { sourceColumn: "Mystery Balance", targetField: "memberCount", confidence: 0.99 },
      { sourceColumn: "1st Member Full Name", targetField: "guestPasses", confidence: 0.99 }
    ]);

    expect(merged.find((entry) => entry.sourceColumn === "Mystery Balance")?.targetField).toBeNull();
    expect(merged.find((entry) => entry.sourceColumn === "1st Member Full Name")?.method).toBe("structural");
  });

  it("keeps wide member slots structural while accepting the household lead as holder", () => {
    const structuralHeaders = [
      "Household Lead",
      "1st Member Full Name",
      "1st Member Age",
      "1st Member Phone",
      "2nd Member Full Name",
      "2nd Member Age",
      "2nd Member Phone"
    ];
    const structuralRows = [[
      "Caleb Lewis",
      "Kevin Lewis",
      "67",
      "3025911540",
      "Ethan Lewis",
      "11",
      "3025550123"
    ]];
    const inferred = inferMapping(
      structuralHeaders,
      structuralRows,
      profileColumns(structuralHeaders, structuralRows)
    );
    const review = buildMappingReview(structuralHeaders, structuralRows, inferred);
    const merged = mergeMappingSuggestions(review, [{
      sourceColumn: "Household Lead",
      targetField: "accountHolderName",
      confidence: 0.95
    }]);
    const effective = applyMappingOverrides(
      inferred,
      structuralHeaders,
      aiMappingOverrides(merged)
    );

    expect(inferred.scalar.accountHolderName).toBeUndefined();
    expect(merged.filter((entry) => entry.targetField === "accountHolderName")).toEqual([
      expect.objectContaining({
        sourceColumn: "Household Lead",
        method: "llm",
        confidence: 0.95
      })
    ]);
    expect(merged.find((entry) => entry.sourceColumn === "1st Member Full Name")).toMatchObject({
      targetField: "familyMemberName",
      method: "structural",
      groupKey: "family-wide"
    });
    expect(merged.find((entry) => entry.sourceColumn === "2nd Member Full Name")).toMatchObject({
      targetField: "familyMemberName",
      method: "structural",
      groupKey: "family-wide"
    });
    expect(effective.scalar.accountHolderName).toBe("Household Lead");
    expect(effective.wideMemberGroups).toHaveLength(2);
  });

  it("does not scalar-map a full-name column consumed by long family grouping", () => {
    const longHeaders = ["Household ID", "Full Name", "Is Primary"];
    const longRows = [
      ["family-1", "Caleb Lewis", "true"],
      ["family-1", "Kevin Lewis", "false"]
    ];
    const inferred = inferMapping(longHeaders, longRows, profileColumns(longHeaders, longRows));

    expect(inferred.longGrouping?.nameColumn).toBe("Full Name");
    expect(inferred.scalar.accountHolderName).toBeUndefined();
    expect(buildMappingReview(longHeaders, longRows, inferred).find(
      (entry) => entry.sourceColumn === "Full Name"
    )).toMatchObject({
      targetField: "familyMemberName",
      method: "structural",
      groupKey: "family-long"
    });
  });
});

describe("buildMappingReview", () => {
  it("includes samples and groups wide family columns", () => {
    const review = buildMappingReview(headers, rows, plan());
    const holder = review.find((entry) => entry.sourceColumn === "Your Full Name");
    const family = review.find((entry) => entry.sourceColumn === "1st Member Full Name");

    expect(holder).toMatchObject({
      targetField: "accountHolderName",
      method: "fuzzy",
      sampleValues: ["Caleb Lewis"],
      editable: true
    });
    expect(family).toMatchObject({
      targetField: "familyMemberName",
      method: "structural",
      groupKey: "family-wide",
      canToggleGroup: true
    });
    expect(family?.editable).toBe(false);
  });
});
