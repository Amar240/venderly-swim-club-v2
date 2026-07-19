const STORAGE_PREFIX = "splash-manager.demo-capability.";
const ACTIVE_CLUB_KEY = "splash-manager.active-demo-club";

export type DemoCapability = {
  demoClubId: string;
  prospectId: string;
};

export const getDemoCapability = (clubId?: string): DemoCapability | null => {
  if (typeof window === "undefined") return null;
  try {
    const selectedClubId = clubId ?? window.sessionStorage.getItem(ACTIVE_CLUB_KEY);
    if (!selectedClubId) return null;
    const value = JSON.parse(
      window.sessionStorage.getItem(`${STORAGE_PREFIX}${selectedClubId}`) ?? "null"
    ) as Partial<DemoCapability> | null;
    return value?.demoClubId && value.prospectId
      ? { demoClubId: value.demoClubId, prospectId: value.prospectId }
      : null;
  } catch {
    return null;
  }
};

export const setDemoCapability = (capability: DemoCapability): void => {
  window.sessionStorage.setItem(`${STORAGE_PREFIX}${capability.demoClubId}`, JSON.stringify(capability));
  window.sessionStorage.setItem(ACTIVE_CLUB_KEY, capability.demoClubId);
};

export const clearDemoCapability = (clubId?: string): void => {
  const selectedClubId = clubId ?? window.sessionStorage.getItem(ACTIVE_CLUB_KEY);
  if (selectedClubId) window.sessionStorage.removeItem(`${STORAGE_PREFIX}${selectedClubId}`);
  if (!clubId || window.sessionStorage.getItem(ACTIVE_CLUB_KEY) === clubId) {
    window.sessionStorage.removeItem(ACTIVE_CLUB_KEY);
  }
};
