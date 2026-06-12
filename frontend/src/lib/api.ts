import axios from "axios";
import { authStore, type StaffSession } from "./auth";

export const api = axios.create({
  baseURL: "/api/v1",
  headers: {
    "Content-Type": "application/json"
  }
});

api.interceptors.request.use((config) => {
  const token = authStore.getToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      authStore.clear();
    }

    return Promise.reject(error);
  }
);

export interface LoginResponse {
  status: "ok";
  data: {
    token: string;
    staff: StaffSession;
  };
}

export interface DashboardSummary {
  visitedToday: number;
  visitedTodayMembers: number;
  visitedTodayGuests: number;
  currentlyInPool: number;
  currentlyInPoolMembers: number;
  currentlyInPoolGuests: number;
  guestsToday: number;
  newMembersToday: number;
  poolCapacity: number;
  capacityPercent: number;
}

export interface ActiveCheckinPerson {
  personId: string;
  firstName: string;
  lastName: string;
  membershipTier: string;
  checkedInAt: string;
  numGuests: number;
  checkinEventId: string;
}

export interface ActiveCheckinsResponse {
  count: number;
  persons: ActiveCheckinPerson[];
}

export interface RecentActivityEvent {
  eventId: string;
  personId: string;
  eventType: "check_in" | "sign_out" | string;
  personName: string;
  membershipTier: string;
  timestamp: string;
  numGuests: number;
}

export interface RecentActivityResponse {
  events: RecentActivityEvent[];
}

export interface SearchMatch {
  personId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  membershipTier: string;
  maxMembers: number;
  membershipStatus: string;
  isCurrentlyIn: boolean;
  familyMembers: string[];
}

export interface SearchResponse {
  matches: SearchMatch[];
}

export interface MemberListItem {
  personId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  personStatus: string;
  membershipId: string;
  membershipTier: string;
  maxMembers: number;
  membershipStatus: string;
  guestPassesTotal: number;
  guestPassesUsed: number;
  familyCount: number;
  isCurrentlyIn: boolean;
}

export interface MembersResponse {
  members: MemberListItem[];
}

export interface MembershipListItem {
  membershipId: string;
  accountHolderPersonId: string | null;
  accountHolderName: string;
  accountHolderFirstName: string;
  accountHolderLastName: string;
  tier: string;
  maxMembers: number;
  status: string;
  guestPassesTotal: number;
  guestPassesUsed: number;
  familyCount: number;
  isAnyMemberCurrentlyIn: boolean;
  membersInPool: number;
}

export interface MembershipsResponse {
  memberships: MembershipListItem[];
}

export interface MemberDetailFamilyMember {
  personId: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  age: number | null;
  relationship: string;
  allergies: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactEmail: string;
  notes: string;
  isPrimary: boolean;
  status: string;
  isCurrentlyIn: boolean;
  checkedInAt: string | null;
}

export interface MemberHistoryEvent {
  eventId: string;
  eventType: string;
  checkedInAt: string;
  signedOutAt: string | null;
  isActive: boolean;
  numGuests: number;
  source: string;
}

export interface MemberDetail {
  personId: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  age: number | null;
  relationship: string;
  allergies: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactEmail: string;
  notes: string;
  isPrimary: boolean;
  personStatus: string;
  membership: {
    membershipId: string;
    tier: string;
    maxMembers: number;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
    addressStreet: string;
    addressCity: string;
    addressState: string;
    addressPostalCode: string;
    addressCountry: string;
    submittedAt: string | null;
    externalOrderId: string;
    emailVerified: boolean;
    phoneVerified: boolean;
    paymentAmountCents: number;
    guestPassesTotal: number;
    guestPassesUsed: number;
    currentGuestsInPool: number;
    guestPassesUsedToday: number;
  };
  family: MemberDetailFamilyMember[];
  history: MemberHistoryEvent[];
}

export interface MemberDetailResponse {
  member: MemberDetail;
}

export interface ManualCheckinResponse {
  success: true;
  message: string;
  personName: string;
  checkinEventId: string;
  checkedInAt: string;
  membershipTier: string;
  maxMembers: number;
  currentlyCheckedIn: number;
  guestsCheckedIn: number;
  guestPassesRemaining: number;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
  isActive: boolean;
  createdAt: string;
}

export interface ActivityEvent {
  eventId: string;
  timestamp: string;
  actionType: "manual_checkin" | "manual_signout";
  staffId: string;
  staffName: string;
  memberName: string;
}

export interface EditActivityEvent {
  id: string;
  createdAt: string;
  staff: {
    id: string;
    name: string;
  };
  targetType: string;
  targetLabel: string;
  changes: Record<string, { from: string | null; to: string | null }>;
}

export type ReportRange = "today" | "week" | "month" | "season";

export interface ReportsSummary {
  range: ReportRange;
  startDate: string;
  endDate: string;
  generatedAt: string;
  kpis: {
    totalVisits: { value: number; delta: number | null };
    uniqueMembers: { value: number; delta: number | null };
    avgPerOpenDay: { value: number; delta: number | null };
    openDays: number;
    busiestDay: { date: string; count: number } | null;
  };
  dailyVisits: Array<{
    date: string;
    members: number;
    guests: number;
    weekday: number;
    peakMembers: number;
    peakPct: number;
  }>;
  peakHeatmap: Array<{ weekday: number; hour: number; count: number }>;
  engagement: {
    buckets: { never: number; casual: number; regular: number };
    neverVisited: Array<{
      membershipId: string;
      primaryPersonId: string | null;
      householdName: string;
      email: string | null;
      phone: string | null;
      tier: string;
      memberSince: string | null;
    }>;
  };
  guestPasses: {
    revenueCents: number;
    packsSold: number;
    passesSold: number;
    guestsAdmitted: number;
    topBuyers: Array<{ householdName: string; packs: number; passes: number }>;
    buyers: Array<{
      householdName: string;
      email: string | null;
      packs: number;
      passes: number;
      guestsAdmitted: number;
    }>;
  };
  capacity: {
    maxCapacity: number;
    avgDailyPeakPct: number;
    daysOver80Pct: number;
    note: "peak concurrency";
  };
  staffActivity: Array<{
    staffId: string;
    name: string;
    manualCheckins: number;
    manualSignouts: number;
    edits: number;
  }>;
  insights: Array<{
    type: "peak" | "engagement" | "revenue" | "unused" | "capacity";
    text: string;
  }>;
}

export type WebhookEventStatus = "RECEIVED" | "PROCESSED" | "FAILED";
export type WebhookEndpoint = "signup" | "checkin" | "signout" | "guestpass";

export interface WebhookEventListItem {
  id: string;
  endpoint: WebhookEndpoint;
  status: WebhookEventStatus;
  errorMessage: string | null;
  replayOfId: string | null;
  receivedAt: string;
  processedAt: string | null;
  payloadPreview: string;
}

export interface WebhookEventDetail extends WebhookEventListItem {
  rawPayload: unknown;
}

export const postLogin = async (pin: string): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>("/auth/login", { pin });
  return response.data;
};

export const postManualCheckin = async (personId: string, numGuests = 0): Promise<ManualCheckinResponse> => {
  const response = await api.post<ManualCheckinResponse>("/dashboard/checkin/manual", { personId, numGuests });
  return response.data;
};

export const postUpdateCapacity = async (capacity: number): Promise<{ success: boolean; capacity: number }> => {
  const response = await api.post<{ success: boolean; capacity: number }>("/dashboard/capacity", { capacity });
  return response.data;
};

export const fetchStaff = async (): Promise<{ staff: StaffMember[] }> => {
  const response = await api.get<{ staff: StaffMember[] }>("/admin/staff");
  return response.data;
};

export const createStaff = async (data: {
  name: string;
  email: string;
  pin: string;
  role: "ADMIN" | "STAFF";
}): Promise<{ staff: StaffMember }> => {
  const response = await api.post<{ staff: StaffMember }>("/admin/staff", data);
  return response.data;
};

export const updateStaff = async (
  id: string,
  data: Partial<{ name: string; pin: string; role: "ADMIN" | "STAFF" }>
): Promise<{ staff: StaffMember }> => {
  const response = await api.patch<{ staff: StaffMember }>(`/admin/staff/${id}`, data);
  return response.data;
};

export const deactivateStaff = async (id: string): Promise<void> => {
  await api.delete(`/admin/staff/${id}`);
};

export const fetchActivity = async (params: {
  staffId?: string;
  date?: string;
  limit?: number;
}): Promise<{ events: ActivityEvent[] }> => {
  const response = await api.get<{ events: ActivityEvent[] }>("/admin/activity", { params });
  return response.data;
};

export const fetchEditActivity = async (params: {
  staffId?: string;
  date?: string;
  limit?: number;
}): Promise<{ events: EditActivityEvent[] }> => {
  const response = await api.get<{ events: EditActivityEvent[] }>("/admin/edits", { params });
  return response.data;
};

export const getReportsSummary = async (range: ReportRange): Promise<ReportsSummary> => {
  const response = await api.get<ReportsSummary>("/reports/summary", { params: { range } });
  return response.data;
};

export const fetchWebhookEvents = async (params: {
  status?: WebhookEventStatus;
  endpoint?: WebhookEndpoint;
  limit?: number;
}): Promise<{ events: WebhookEventListItem[] }> => {
  const response = await api.get<{ events: WebhookEventListItem[] }>("/admin/webhooks", { params });
  return response.data;
};

export const fetchWebhookEvent = async (id: string): Promise<{ event: WebhookEventDetail }> => {
  const response = await api.get<{ event: WebhookEventDetail }>(`/admin/webhooks/${id}`);
  return response.data;
};

export const replayWebhookEvent = async (
  id: string
): Promise<{ replayedEventId: string; status: WebhookEventStatus; statusCode: number }> => {
  const response = await api.post<{ replayedEventId: string; status: WebhookEventStatus; statusCode: number }>(
    `/admin/webhooks/${id}/replay`
  );
  return response.data;
};

export const patchPerson = async (
  personId: string,
  body: Record<string, unknown>
): Promise<{ person: Record<string, unknown> }> => {
  const response = await api.patch<{ person: Record<string, unknown> }>(`/members/persons/${personId}`, body);
  return response.data;
};

export const patchAddress = async (
  membershipId: string,
  body: Record<string, unknown>
): Promise<{ membership: Record<string, unknown> }> => {
  const response = await api.patch<{ membership: Record<string, unknown> }>(
    `/members/memberships/${membershipId}/address`,
    body
  );
  return response.data;
};

export const patchEmergency = async (
  membershipId: string,
  body: Record<string, unknown>
): Promise<{ membershipId: string; updatedCount: number }> => {
  const response = await api.patch<{ membershipId: string; updatedCount: number }>(
    `/members/memberships/${membershipId}/emergency`,
    body
  );
  return response.data;
};

export const fetchMemberships = async (params: { q?: string; tier?: string }): Promise<MembershipsResponse> => {
  const response = await api.get<MembershipsResponse>("/memberships", { params });
  return response.data;
};
