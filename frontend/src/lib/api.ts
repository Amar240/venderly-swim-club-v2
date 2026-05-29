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
  currentlyInPool: number;
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

export const postLogin = async (pin: string): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>("/auth/login", {
    email: "staff@wedgewood.com",
    pin
  });
  return response.data;
};

export const postManualCheckin = async (personId: string, numGuests = 0): Promise<ManualCheckinResponse> => {
  const response = await api.post<ManualCheckinResponse>("/dashboard/checkin/manual", { personId, numGuests });
  return response.data;
};

export const fetchMemberships = async (params: { q?: string; tier?: string }): Promise<MembershipsResponse> => {
  const response = await api.get<MembershipsResponse>("/memberships", { params });
  return response.data;
};
