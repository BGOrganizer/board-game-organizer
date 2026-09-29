import type { CreateGroupInput, GroupResponse } from "@board-game-organizer/schemas";
import { apiHeaders, withProtectionBypass } from "@board-game-organizer/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MutationFeedback, MutationFeedbackAction } from "../mutationFeedback";

export interface GroupsApiOptions {
  apiUrl: string;
  token: string | null | undefined;
  getToken?: () => Promise<string | null>;
  protectionBypass?: string | null;
  userId?: string | null;
  feedback?: MutationFeedback;
}

export function useGroups({
  apiUrl,
  token,
  getToken,
  protectionBypass,
  userId,
  feedback,
}: GroupsApiOptions) {
  const queryClient = useQueryClient();
  const key = ["groups", apiUrl, token] as const;
  async function request<T>(path: string, method = "GET", input?: unknown): Promise<T> {
    const fresh = getToken ? await getToken() : token;
    if (!fresh) throw new Error("No session token");
    const res = await fetch(withProtectionBypass(`${apiUrl}/api/${path}`, protectionBypass), {
      method,
      headers: apiHeaders(fresh),
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  function notify(action: MutationFeedbackAction) {
    feedback?.onOptimisticUpdate?.(action);
  }
  function rollback(error: Error, action: MutationFeedbackAction) {
    feedback?.onError?.(error, action);
  }
  function optimistic(
    action: MutationFeedbackAction,
    patch: (rows: GroupResponse[]) => GroupResponse[],
  ) {
    const previous = queryClient.getQueryData<GroupResponse[]>(key);
    if (previous) queryClient.setQueryData(key, patch(previous));
    notify(action);
    return { previous };
  }
  function undo(
    context: { previous?: GroupResponse[] } | undefined,
    error: Error,
    action: MutationFeedbackAction,
  ) {
    if (context?.previous) queryClient.setQueryData(key, context.previous);
    rollback(error, action);
  }
  const list = useQuery({
    queryKey: key,
    queryFn: async () => (await request<{ groups: GroupResponse[] }>("groups")).groups,
    enabled: Boolean(apiUrl && token),
  });
  const create = useMutation({
    mutationFn: async (input: CreateGroupInput) =>
      (await request<{ group: GroupResponse }>("groups", "POST", input)).group,
    onMutate: (input) =>
      optimistic("create_group", (rows) => [
        {
          id: `optimistic-${Date.now()}`,
          adminUserId: userId ?? "",
          name: input.name,
          isPublic: input.isPublic,
          memberCount: 1,
          invitations: [],
          memberProfiles: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...rows,
      ]),
    onError: (error, _input, context) => undo(context, error, "create_group"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CreateGroupInput }) =>
      (await request<{ group: GroupResponse }>(`groups/${encodeURIComponent(id)}`, "PATCH", input))
        .group,
    onMutate: ({ id, input }) =>
      optimistic("update_group", (rows) =>
        rows.map((row) =>
          row.id === id
            ? {
                ...row,
                name: input.name,
                isPublic: input.isPublic,
                memberCount:
                  1 +
                  row.invitations.filter(
                    (i) =>
                      i.status === "ACCEPTED" && input.invitedUserIds.includes(i.inviteeUserId),
                  ).length,
                invitations: row.invitations.filter((i) =>
                  input.invitedUserIds.includes(i.inviteeUserId),
                ),
              }
            : row,
        ),
      ),
    onError: (error, _input, context) => undo(context, error, "update_group"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
  const archive = useMutation({
    mutationFn: async (id: string) => request(`groups/${encodeURIComponent(id)}`, "DELETE"),
    onMutate: (id) => optimistic("delete_group", (rows) => rows.filter((row) => row.id !== id)),
    onError: (error, _id, context) => undo(context, error, "delete_group"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
  const respond = useMutation({
    mutationFn: async ({
      invitationId,
      decision,
    }: {
      invitationId: string;
      decision: "accept" | "decline";
    }) =>
      (
        await request<{ group: GroupResponse | null }>(
          `group-invitations/${encodeURIComponent(invitationId)}`,
          "PATCH",
          { decision },
        )
      ).group,
    onMutate: ({ invitationId, decision }) =>
      optimistic(
        decision === "accept" ? "accept_group_invitation" : "decline_group_invitation",
        (rows) =>
          rows.flatMap((row) => {
            const invitation = row.invitations.find((item) => item.id === invitationId);
            if (!invitation) return [row];
            if (decision === "decline") return [];
            return [
              {
                ...row,
                memberCount: row.memberCount + 1,
                invitations: row.invitations.map((item) =>
                  item.id === invitationId ? { ...item, status: "ACCEPTED" as const } : item,
                ),
              },
            ];
          }),
      ),
    onError: (error, variables, context) =>
      undo(
        context,
        error,
        variables.decision === "accept" ? "accept_group_invitation" : "decline_group_invitation",
      ),
    onSuccess: (group) => {
      if (group)
        queryClient.setQueryData<GroupResponse[]>(key, (rows) =>
          rows?.map((row) => (row.id === group.id ? group : row)),
        );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
  const removeInvitation = useMutation({
    mutationFn: async (invitationId: string) =>
      request(`group-invitations/${encodeURIComponent(invitationId)}`, "DELETE"),
    onMutate: (invitationId) =>
      optimistic("remove_group_invitation", (rows) =>
        rows.map((row) => {
          const invitation = row.invitations.find((item) => item.id === invitationId);
          if (!invitation) return row;
          return {
            ...row,
            memberCount: row.memberCount - (invitation.status === "ACCEPTED" ? 1 : 0),
            memberProfiles: row.memberProfiles.filter(
              (user) => user.id !== invitation.inviteeUserId,
            ),
            invitations: row.invitations.filter((item) => item.id !== invitationId),
          };
        }),
      ),
    onError: (error, _id, context) => undo(context, error, "remove_group_invitation"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
  const leave = useMutation({
    mutationFn: async (id: string) =>
      request(`groups/${encodeURIComponent(id)}/membership`, "DELETE"),
    onMutate: (id) => optimistic("leave_group", (rows) => rows.filter((row) => row.id !== id)),
    onError: (error, _id, context) => undo(context, error, "leave_group"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
  return { list, create, update, archive, respond, leave, removeInvitation };
}
