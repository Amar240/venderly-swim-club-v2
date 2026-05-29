import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  postManualCheckin,
  type ActiveCheckinsResponse,
  type DashboardSummary,
  type ManualCheckinResponse
} from "../lib/api";

export interface ManualCheckinVariables {
  personId: string;
  firstName: string;
  lastName: string;
  membershipTier: string;
}

interface ManualCheckinContext {
  previousActive?: ActiveCheckinsResponse;
  previousSummary?: DashboardSummary;
}

export const useManualCheckin = () => {
  const queryClient = useQueryClient();

  return useMutation<ManualCheckinResponse, Error, ManualCheckinVariables, ManualCheckinContext>({
    mutationFn: ({ personId }) => postManualCheckin(personId),
    onMutate: async (person) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["dashboard", "active"] }),
        queryClient.cancelQueries({ queryKey: ["dashboard", "summary"] })
      ]);

      const previousActive = queryClient.getQueryData<ActiveCheckinsResponse>(["dashboard", "active"]);
      const previousSummary = queryClient.getQueryData<DashboardSummary>(["dashboard", "summary"]);

      queryClient.setQueryData<ActiveCheckinsResponse>(["dashboard", "active"], (current) => {
        if (!current || current.persons.some((activePerson) => activePerson.personId === person.personId)) {
          return current;
        }

        return {
          count: current.count + 1,
          persons: [
            {
              personId: person.personId,
              firstName: person.firstName,
              lastName: person.lastName,
              membershipTier: person.membershipTier,
              checkedInAt: new Date().toISOString(),
              numGuests: 0,
              checkinEventId: `optimistic-${person.personId}`
            },
            ...current.persons
          ]
        };
      });

      queryClient.setQueryData<DashboardSummary>(["dashboard", "summary"], (current) => {
        if (!current) {
          return current;
        }

        const currentlyInPool = current.currentlyInPool + 1;

        return {
          ...current,
          currentlyInPool,
          capacityPercent: current.poolCapacity === 0 ? 0 : (currentlyInPool / current.poolCapacity) * 100
        };
      });

      return { previousActive, previousSummary };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousActive) {
        queryClient.setQueryData(["dashboard", "active"], context.previousActive);
      }

      if (context?.previousSummary) {
        queryClient.setQueryData(["dashboard", "summary"], context.previousSummary);
      }

      toast.error("Couldn't check in this member.");
    },
    onSuccess: (data) => {
      toast.success(`✓ Welcome ${data.personName}!`);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", "active"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "recent"] }),
        queryClient.invalidateQueries({ queryKey: ["members"] })
      ]);
    }
  });
};
