import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  postManualCheckin,
  type ActiveCheckinsResponse,
  type DashboardSummary,
  type MemberDetailResponse,
  type ManualCheckinResponse
} from "../lib/api";

export interface ManualCheckinVariables {
  personId: string;
  firstName: string;
  lastName: string;
  membershipTier: string;
  numGuests?: number;
  detailPersonId?: string | null;
}

interface ManualCheckinContext {
  previousActive?: ActiveCheckinsResponse;
  previousSummary?: DashboardSummary;
  previousDetail?: MemberDetailResponse;
  detailPersonId?: string | null;
}

export const useManualCheckin = () => {
  const queryClient = useQueryClient();

  return useMutation<ManualCheckinResponse, Error, ManualCheckinVariables, ManualCheckinContext>({
    mutationFn: ({ personId, numGuests = 0 }) => postManualCheckin(personId, numGuests),
    onMutate: async (person) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["dashboard", "active"] }),
        queryClient.cancelQueries({ queryKey: ["dashboard", "summary"] }),
        person.detailPersonId
          ? queryClient.cancelQueries({ queryKey: ["members", "detail", person.detailPersonId] })
          : Promise.resolve()
      ]);

      const previousActive = queryClient.getQueryData<ActiveCheckinsResponse>(["dashboard", "active"]);
      const previousSummary = queryClient.getQueryData<DashboardSummary>(["dashboard", "summary"]);
      const previousDetail = person.detailPersonId
        ? queryClient.getQueryData<MemberDetailResponse>(["members", "detail", person.detailPersonId])
        : undefined;
      const numGuests = person.numGuests ?? 0;
      const checkedInAt = new Date().toISOString();

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
              checkedInAt,
              numGuests,
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

        const currentlyInPool = current.currentlyInPool + 1 + numGuests;

        return {
          ...current,
          visitedToday: current.visitedToday + 1 + numGuests,
          visitedTodayMembers: current.visitedTodayMembers + 1,
          visitedTodayGuests: current.visitedTodayGuests + numGuests,
          currentlyInPool,
          currentlyInPoolMembers: current.currentlyInPoolMembers + 1,
          currentlyInPoolGuests: current.currentlyInPoolGuests + numGuests,
          guestsToday: current.guestsToday + numGuests,
          capacityPercent: current.poolCapacity === 0 ? 0 : (currentlyInPool / current.poolCapacity) * 100
        };
      });

      if (person.detailPersonId) {
        queryClient.setQueryData<MemberDetailResponse>(["members", "detail", person.detailPersonId], (current) => {
          if (!current) {
            return current;
          }

          return {
            member: {
              ...current.member,
              membership: {
                ...current.member.membership,
                guestPassesUsed: current.member.membership.guestPassesUsed + numGuests,
                guestPassesUsedToday: current.member.membership.guestPassesUsedToday + numGuests,
                currentGuestsInPool: current.member.membership.currentGuestsInPool + numGuests
              },
              family: current.member.family.map((familyMember) =>
                familyMember.personId === person.personId
                  ? {
                      ...familyMember,
                      isCurrentlyIn: true,
                      checkedInAt
                    }
                  : familyMember
              )
            }
          };
        });
      }

      return { previousActive, previousSummary, previousDetail, detailPersonId: person.detailPersonId };
    },
    onError: (error, _variables, context) => {
      if (context?.previousActive) {
        queryClient.setQueryData(["dashboard", "active"], context.previousActive);
      }

      if (context?.previousSummary) {
        queryClient.setQueryData(["dashboard", "summary"], context.previousSummary);
      }

      if (context?.detailPersonId && context.previousDetail) {
        queryClient.setQueryData(["members", "detail", context.detailPersonId], context.previousDetail);
      }

      const message = (error as any)?.response?.data?.error?.message ?? "Couldn't check in";
      toast.error(message);
    },
    onSuccess: (data) => {
      toast.success(`✓ Welcome ${data.personName}!`);
    },
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", "active"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "recent"] }),
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        variables.detailPersonId
          ? queryClient.invalidateQueries({ queryKey: ["members", "detail", variables.detailPersonId] })
          : Promise.resolve()
      ]);
    }
  });
};
