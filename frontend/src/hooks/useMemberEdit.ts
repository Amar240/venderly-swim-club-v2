import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  deletePerson,
  patchAddress,
  patchEmergency,
  patchPerson,
  postAddPerson,
  type AddPersonResponse,
  type MemberDetailFamilyMember,
  type MemberDetailResponse
} from "../lib/api";

type DetailSnapshot = Array<[QueryKey, MemberDetailResponse | undefined]>;

const detailQueryKey = ["members", "detail"] as const;

const fullName = (person: { firstName: string; lastName: string }): string =>
  `${person.firstName} ${person.lastName}`.trim();

const withUpdatedName = <T extends { firstName: string; lastName: string; name: string }>(
  person: T,
  body: Record<string, unknown>
): T => {
  const next = {
    ...person,
    ...body
  } as T;

  if (body.firstName !== undefined || body.lastName !== undefined) {
    next.name = fullName(next);
  }

  return next;
};

const restoreSnapshots = (queryClient: ReturnType<typeof useQueryClient>, snapshots: DetailSnapshot): void => {
  for (const [key, value] of snapshots) {
    queryClient.setQueryData(key, value);
  }
};

export const useUpdatePerson = (detailPersonId: string | null, personId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => patchPerson(personId, body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: detailQueryKey });
      const snapshots = queryClient.getQueriesData<MemberDetailResponse>({ queryKey: detailQueryKey });

      for (const [key, current] of snapshots) {
        if (!current?.member.family.some((person) => person.personId === personId)) {
          continue;
        }

        queryClient.setQueryData<MemberDetailResponse>(key, {
          member: {
            ...withUpdatedName(current.member, current.member.personId === personId ? body : {}),
            family: current.member.family.map((person) =>
              person.personId === personId ? withUpdatedName(person, body) : person
            )
          }
        });
      }

      return { snapshots };
    },
    onError: (_error, _body, context) => {
      if (context?.snapshots) {
        restoreSnapshots(queryClient, context.snapshots);
      }

      toast.error("Couldn't save changes");
    },
    onSuccess: () => {
      toast.success("Saved");
    },
    onSettled: async () => {
      await Promise.all([
        detailPersonId
          ? queryClient.invalidateQueries({ queryKey: ["members", "detail", detailPersonId] })
          : queryClient.invalidateQueries({ queryKey: detailQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        queryClient.invalidateQueries({ queryKey: ["memberships"] })
      ]);
    }
  });
};

export const useUpdateAddress = (membershipId: string | undefined, detailPersonId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (!membershipId) {
        throw new Error("membershipId is required");
      }

      return patchAddress(membershipId, body);
    },
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: detailQueryKey });
      const snapshots = queryClient.getQueriesData<MemberDetailResponse>({ queryKey: detailQueryKey });

      for (const [key, current] of snapshots) {
        if (!current || current.member.membership.membershipId !== membershipId) {
          continue;
        }

        queryClient.setQueryData<MemberDetailResponse>(key, {
          member: {
            ...current.member,
            membership: {
              ...current.member.membership,
              ...body
            }
          }
        });
      }

      return { snapshots };
    },
    onError: (_error, _body, context) => {
      if (context?.snapshots) {
        restoreSnapshots(queryClient, context.snapshots);
      }

      toast.error("Couldn't save changes");
    },
    onSuccess: () => {
      toast.success("Saved");
    },
    onSettled: async () => {
      await Promise.all([
        detailPersonId
          ? queryClient.invalidateQueries({ queryKey: ["members", "detail", detailPersonId] })
          : queryClient.invalidateQueries({ queryKey: detailQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        queryClient.invalidateQueries({ queryKey: ["memberships"] })
      ]);
    }
  });
};

export const useUpdateEmergency = (membershipId: string | undefined, detailPersonId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (!membershipId) {
        throw new Error("membershipId is required");
      }

      return patchEmergency(membershipId, body);
    },
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: detailQueryKey });
      const snapshots = queryClient.getQueriesData<MemberDetailResponse>({ queryKey: detailQueryKey });

      for (const [key, current] of snapshots) {
        if (!current || current.member.membership.membershipId !== membershipId) {
          continue;
        }

        const updateEmergency = <T extends Pick<MemberDetailFamilyMember, "emergencyContactName" | "emergencyContactPhone" | "emergencyContactEmail">>(
          person: T
        ): T => ({ ...person, ...body });

        queryClient.setQueryData<MemberDetailResponse>(key, {
          member: {
            ...updateEmergency(current.member),
            family: current.member.family.map((person) => updateEmergency(person))
          }
        });
      }

      return { snapshots };
    },
    onError: (_error, _body, context) => {
      if (context?.snapshots) {
        restoreSnapshots(queryClient, context.snapshots);
      }

      toast.error("Couldn't save changes");
    },
    onSuccess: () => {
      toast.success("Saved");
    },
    onSettled: async () => {
      await Promise.all([
        detailPersonId
          ? queryClient.invalidateQueries({ queryKey: ["members", "detail", detailPersonId] })
          : queryClient.invalidateQueries({ queryKey: detailQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        queryClient.invalidateQueries({ queryKey: ["memberships"] })
      ]);
    }
  });
};

const useInvalidateMemberData = (detailPersonId: string | null) => {
  const queryClient = useQueryClient();

  return async (): Promise<void> => {
    await Promise.all([
      detailPersonId
        ? queryClient.invalidateQueries({ queryKey: ["members", "detail", detailPersonId] })
        : queryClient.invalidateQueries({ queryKey: detailQueryKey }),
      queryClient.invalidateQueries({ queryKey: ["members"] }),
      queryClient.invalidateQueries({ queryKey: ["memberships"] })
    ]);
  };
};

export const useAddPerson = (membershipId: string | undefined, detailPersonId: string | null) => {
  const invalidate = useInvalidateMemberData(detailPersonId);

  return useMutation<AddPersonResponse, unknown, Record<string, unknown>>({
    mutationFn: (body) => {
      if (!membershipId) {
        throw new Error("membershipId is required");
      }

      return postAddPerson(membershipId, body);
    },
    onError: () => {
      toast.error("Couldn't add the member");
    },
    onSettled: async () => {
      await invalidate();
    }
  });
};

export const useDeletePerson = (detailPersonId: string | null) => {
  const invalidate = useInvalidateMemberData(detailPersonId);

  return useMutation<{ personId: string }, unknown, string>({
    mutationFn: (personId) => deletePerson(personId),
    onSettled: async () => {
      await invalidate();
    }
  });
};
