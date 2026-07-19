import { describe, expect, it } from "vitest";
import {
  applyMappingOverrides,
  buildMappingReview,
  inferMapping,
  mergeMappingSuggestions
} from "../../src/ingestion/mapping";
import { profileColumns } from "../../src/ingestion/profile";

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
  });
});
