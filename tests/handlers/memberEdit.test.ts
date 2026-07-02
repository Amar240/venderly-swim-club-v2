import { describe, expect, it } from "vitest";
import {
  adjustGuestPassesSchema,
  calculateGuestPassAdjustment,
  cleanPhone,
  computeFieldChanges,
  updateEmergencySchema,
  updatePersonSchema
} from "../../src/handlers/memberEdit";

describe("cleanPhone", () => {
  it("normalizes phone numbers to 10 digits", () => {
    expect(cleanPhone("(302) 555-1234")).toBe("3025551234");
  });

  it("returns null for empty input", () => {
    expect(cleanPhone("")).toBeNull();
  });

  it("returns undefined for undefined input", () => {
    expect(cleanPhone(undefined)).toBeUndefined();
  });

  it("returns null when no digits are present", () => {
    expect(cleanPhone("abc")).toBeNull();
  });
});

describe("computeFieldChanges", () => {
  it("returns changed fields with normalized string values", () => {
    expect(computeFieldChanges({ age: 40 }, { age: 41 })).toEqual({
      age: { from: "40", to: "41" }
    });
  });

  it("omits unchanged values", () => {
    expect(computeFieldChanges({ firstName: "Kelly" }, { firstName: "Kelly" })).toEqual({});
  });

  it("normalizes empty strings and nulls", () => {
    expect(computeFieldChanges({ email: "kelly@example.com", phone: null }, { email: "", phone: " " })).toEqual({
      email: { from: "kelly@example.com", to: null }
    });
  });

  it("ignores undefined update values", () => {
    expect(computeFieldChanges({ email: "kelly@example.com" }, { email: undefined })).toEqual({});
  });
});

describe("updatePersonSchema", () => {
  it("rejects invalid ages", () => {
    expect(() => updatePersonSchema.parse({ age: 200 })).toThrow();
  });

  it("allows clearing email", () => {
    expect(updatePersonSchema.parse({ email: "" })).toEqual({ email: "" });
  });

  it("rejects invalid email", () => {
    expect(() => updatePersonSchema.parse({ email: "bad" })).toThrow();
  });
});

describe("updateEmergencySchema", () => {
  it("allows clearing email", () => {
    expect(updateEmergencySchema.parse({ emergencyContactEmail: "" })).toEqual({ emergencyContactEmail: "" });
  });

  it("rejects invalid email", () => {
    expect(() => updateEmergencySchema.parse({ emergencyContactEmail: "bad" })).toThrow();
  });
});

describe("adjustGuestPassesSchema", () => {
  it("rejects a zero quantity", () => {
    expect(() => adjustGuestPassesSchema.parse({ quantity: 0, reason: "purchase" })).toThrow();
  });
});

describe("calculateGuestPassAdjustment", () => {
  it("returns the new total for valid additions and removals", () => {
    expect(calculateGuestPassAdjustment({ guestPassesTotal: 0, guestPassesUsed: 0, quantity: 10 })).toBe(10);
    expect(calculateGuestPassAdjustment({ guestPassesTotal: 10, guestPassesUsed: 5, quantity: -3 })).toBe(7);
  });

  it("throws when removing below used passes", () => {
    expect(() =>
      calculateGuestPassAdjustment({ guestPassesTotal: 10, guestPassesUsed: 5, quantity: -6 })
    ).toThrow("Cannot remove more guest passes than the member has available");
  });
});
