export const GUEST_PASS_CUTOFF = new Date('2026-05-01T23:59:59Z');
export const FREE_PASSES_BEFORE_CUTOFF = 5;
export const FREE_PASSES_AFTER_CUTOFF = 0;
export const PASSES_PER_PACK = 10;

export const calculateInitialGuestPasses = (submittedAt: Date | null): number => {
  if (!submittedAt) {
    return FREE_PASSES_AFTER_CUTOFF;
  }

  return submittedAt < GUEST_PASS_CUTOFF ? FREE_PASSES_BEFORE_CUTOFF : FREE_PASSES_AFTER_CUTOFF;
};
