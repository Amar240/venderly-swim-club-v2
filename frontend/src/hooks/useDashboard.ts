import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  api,
  type ActiveCheckinsResponse,
  type DashboardSummary,
  type RecentActivityResponse,
  type SearchResponse
} from "../lib/api";
import { recordPollFailure, recordPollSuccess } from "./useConnection";

const POLL_INTERVAL_MS = 3_000;

const usePollHealth = (isSuccess: boolean, isError: boolean, dataUpdatedAt: number, errorUpdatedAt: number): void => {
  useEffect(() => {
    if (isSuccess) {
      recordPollSuccess();
    }
  }, [dataUpdatedAt, isSuccess]);

  useEffect(() => {
    if (isError) {
      recordPollFailure();
    }
  }, [errorUpdatedAt, isError]);
};

export const useDashboardSummary = () => {
  const query = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: async () => {
      const response = await api.get<DashboardSummary>("/dashboard/summary");
      return response.data;
    },
    refetchInterval: POLL_INTERVAL_MS
  });

  usePollHealth(query.isSuccess, query.isError, query.dataUpdatedAt, query.errorUpdatedAt);
  return query;
};

export const useActiveCheckins = () => {
  const query = useQuery({
    queryKey: ["dashboard", "active"],
    queryFn: async () => {
      const response = await api.get<ActiveCheckinsResponse>("/dashboard/active");
      return response.data;
    },
    refetchInterval: POLL_INTERVAL_MS
  });

  usePollHealth(query.isSuccess, query.isError, query.dataUpdatedAt, query.errorUpdatedAt);
  return query;
};

export const useRecentActivity = () => {
  const query = useQuery({
    queryKey: ["dashboard", "recent"],
    queryFn: async () => {
      const response = await api.get<RecentActivityResponse>("/dashboard/recent", {
        params: { limit: 10 }
      });
      return response.data;
    },
    refetchInterval: POLL_INTERVAL_MS
  });

  usePollHealth(query.isSuccess, query.isError, query.dataUpdatedAt, query.errorUpdatedAt);
  return query;
};

export const useDashboardSearch = (queryText: string) =>
  useQuery({
    queryKey: ["dashboard", "search", queryText],
    enabled: queryText.trim().length >= 2,
    queryFn: async () => {
      const response = await api.get<SearchResponse>("/dashboard/search", {
        params: { q: queryText.trim() }
      });
      return response.data;
    }
  });

export const useManualSignout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (personId: string) => {
      const response = await api.post<{ success: boolean; message: string }>("/dashboard/signout/manual", { personId });
      return response.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["members"] })
      ]);
    }
  });
};
