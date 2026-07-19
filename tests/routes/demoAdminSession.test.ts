import { describe, expect, it } from "vitest";
import { demoStaffEmailCandidates, isDemoStaffEmail } from "../../src/routes/demoAdminSession";

describe("demo staff email synthesis", () => {
  it("creates short and full plus-addressed candidates", () => {
    const candidates = demoStaffEmailCandidates(
      "owner+board@example.com",
      "123e4567-e89b-12d3-a456-426614174000"
    );

    expect(candidates).toEqual([
      "owner+board+demo-123e4567e89b@example.com",
      "owner+board+demo-123e4567e89b12d3a456426614174000@example.com"
    ]);
    expect(candidates.every(isDemoStaffEmail)).toBe(true);
  });
});
