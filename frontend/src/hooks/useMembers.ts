import { useQuery } from "@tanstack/react-query";
import { api, fetchMemberships, type MemberDetailResponse, type MembersResponse } from "../lib/api";

export const useMembers = (opts: { q: string; tier: string }) =>
  useQuery({
    queryKey: ["members", opts],
    queryFn: async () => {
      const response = await api.get<MembersResponse>("/members", {
        params: {
          q: opts.q || undefined,
          tier: opts.tier === "All" ? undefined : opts.tier
        }
      });
      return response.data;
    }
  });

export const useMemberships = (opts: { q: string; tier: string }) =>
  useQuery({
    queryKey: ["memberships", opts],
    queryFn: () =>
      fetchMemberships({
        q: opts.q || undefined,
        tier: opts.tier === "All" ? undefined : opts.tier
      })
  });

export const useMemberDetail = (personId: string | null) =>
  useQuery({
    queryKey: ["members", "detail", personId],
    enabled: Boolean(personId),
    queryFn: async () => {
      const response = await api.get<MemberDetailResponse>(`/members/${personId}`);
      return response.data;
    }
  });
