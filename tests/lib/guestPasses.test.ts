import { describe, expect, it } from "vitest";
import {
  FREE_PASSES_AFTER_CUTOFF,
  FREE_PASSES_BEFORE_CUTOFF,
  GUEST_PASS_CUTOFF,
  PASSES_PER_PACK,
  calculateInitialGuestPasses
} from "../../src/lib/guestPasses";

describe("calculateInitialGuestPasses", () => {
  it("returns zero for null input", () => {
    expect(calculateInitialGuestPasses(null)).toBe(0);
  });

  it("returns free passes before the cutoff", () => {
    expect(calculateInitialGuestPasses(new Date("2026-04-30T23:59:59Z"))).toBe(5);
  });

  it("returns free passes on May 1 before the cutoff instant", () => {
    expect(calculateInitialGuestPasses(new Date("2026-05-01T23:59:00Z"))).toBe(5);
  });

  it("returns zero after the cutoff", () => {
    expect(calculateInitialGuestPasses(new Date("2026-05-02T00:00:00Z"))).toBe(0);
  });
});

describe("guest pass constants", () => {
  it("exports the guest-pass pack size", () => {
    expect(PASSES_PER_PACK).toBe(10);
  });

  it("exports cutoff and free-pass constants", () => {
    expect(GUEST_PASS_CUTOFF).toBeInstanceOf(Date);
    expect(FREE_PASSES_BEFORE_CUTOFF).toBeDefined();
    expect(FREE_PASSES_AFTER_CUTOFF).toBeDefined();
  });
});
