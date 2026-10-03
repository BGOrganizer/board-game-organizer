import type { CreateGroupInput, GroupResponse } from "@board-game-organizer/schemas";
import { apiHeaders, withProtectionBypass } from "@board-game-organizer/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MutationFeedback, MutationFeedbackAction } from "../mutationFeedback";
import { filterPagedRows, type ListFilters, listPagePath, patchPagedList } from "./listFilters";

export interface GroupsApiOptions {
  apiUrl: string;
  token: string | null | undefined;
  getToken?: () => Promise<string | null>;
  protectionBypass?: string | null;
  userId?: string | null;
  feedback?: MutationFeedback;
  listFilters?: ListFilters;
  groupId?: string;
}

export function groupsPageQuery({
  apiUrl,
  token,
  getToken,
  protectionBypass,
  listFilters,
  userId,
}: GroupsApiOptions) {
  return {
    queryKey: [
      "groups",
      "paged",
      apiUrl,
      userId ?? token,
      listFilters?.query,
      listFilters?.roles.join(","),
    ] as const,
    queryFn: async ({ pageParam }: { pageParam: string }) => {
      if (!listFilters) throw new Error("Missing list filters");
      const fresh = getToken ? await getToken() : token;
      if (!fresh) throw new Error("No session token");
      const response = await fetch(
        withProtectionBypass(
          `${apiUrl}/api/${listPagePath("groups", listFilters, pageParam)}`,
          protectionBypass,
        ),
        { headers: apiHeaders(fresh) },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<{ groups: GroupResponse[]; nextCursor: string | null }>;
    },
    initialPageParam: "",
    getNextPageParam: (page: { nextCursor: string | null }) => page.nextCursor ?? undefined,
  };
}

export function useGroups({
  apiUrl,
  token,
  getToken,
  protectionBypass,
  userId,
  feedback,
  listFilters,
  groupId,
}: GroupsApiOptions) {
  const queryClient = useQueryClient();
  const key = ["groups", apiUrl, userId ?? token] as const;
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
  async function optimistic(
    action: MutationFeedbackAction,
    patch: (rows: GroupResponse[]) => GroupResponse[],
  ) {
    await queryClient.cancelQueries({ queryKey: ["groups"] });
    const snapshots = queryClient.getQueriesData({ queryKey: ["groups"] });
    for (const [queryKey, data] of snapshots) {
      if (Array.isArray(data)) queryClient.setQueryData(queryKey, patch(data));
      else if (data && typeof data === "object" && "group" in data) {
        const group = patch([(data as { group: GroupResponse }).group])[0];
        if (group) queryClient.setQueryData(queryKey, { ...data, group });
      } else
        queryClient.setQueryData(
          queryKey,
          patchPagedList(data, "groups", (rows: GroupResponse[], index) =>
            filterPagedRows(
              action === "create_group" && index > 0 ? rows : patch(rows),
              userId,
              queryKey,
            ),
          ),
        );
    }
    notify(action);
    return { snapshots };
  }
  function undo(
    context: { snapshots: [readonly unknown[], unknown][] } | undefined,
    error: Error,
    action: MutationFeedbackAction,
  ) {
    for (const [queryKey, data] of context?.snapshots ?? [])
      queryClient.setQueryData(queryKey, data);
    rollback(error, action);
  }
  function reconcile(group: GroupResponse) {
    for (const [queryKey, data] of queryClient.getQueriesData({ queryKey: ["groups"] })) {
      const replace = (rows: GroupResponse[]) =>
        rows.map((row) => (row.id === group.id ? group : row));
      if (Array.isArray(data)) queryClient.setQueryData(queryKey, replace(data));
      else if (data && typeof data === "object" && "group" in data) {
        if ((data as { group: GroupResponse }).group.id === group.id)
          queryClient.setQueryData(queryKey, { ...data, group });
      } else
        queryClient.setQueryData(
          queryKey,
          patchPagedList(data, "groups", (rows: GroupResponse[]) =>
            filterPagedRows(replace(rows), userId, queryKey),
          ),
        );
    }
  }
  const legacyList = useQuery({
    queryKey: key,
    queryFn: async () => (await request<{ groups: GroupResponse[] }>("groups")).groups,
    enabled: Boolean(apiUrl && token && !listFilters && !groupId),
  });
  const paging = useInfiniteQuery({
    ...groupsPageQuery({ apiUrl, token, getToken, protectionBypass, listFilters, userId }),
    enabled: Boolean(apiUrl && token && listFilters),
  });
  const detail = useQuery({
    queryKey: ["groups", "detail", groupId, apiUrl, userId ?? token],
    queryFn: () => request<{ group: GroupResponse }>(`groups/${encodeURIComponent(groupId ?? "")}`),
    enabled: Boolean(apiUrl && token && groupId),
    staleTime: 5 * 60_000,
    initialData: () => {
      if (!groupId || !userId) return undefined;
      for (const [queryKey, data] of queryClient.getQueriesData({
        queryKey: ["groups", "paged", apiUrl, userId],
      })) {
        if (queryKey[4] !== "" || queryKey[5] !== "admin,invited,accepted") continue;
        const pages = data && typeof data === "object" && "pages" in data ? data.pages : [];
        for (const page of pages as { groups: GroupResponse[] }[]) {
          const group = page.groups.find((item) => item.id === groupId);
          if (group) return { group };
        }
      }
      return undefined;
    },
  });
  const list = listFilters
    ? { ...paging, data: paging.data?.pages.flatMap((page) => page.groups) }
    : legacyList;
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
    onSuccess: (group) => reconcile(group),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["groups"], refetchType: "none" }),
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
      if (group) reconcile(group);
      void queryClient.invalidateQueries({ queryKey: ["group-leaderboard"] });
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["group-leaderboard"] }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
  const leave = useMutation({
    mutationFn: async (id: string) =>
      request(`groups/${encodeURIComponent(id)}/membership`, "DELETE"),
    onMutate: (id) => optimistic("leave_group", (rows) => rows.filter((row) => row.id !== id)),
    onError: (error, _id, context) => undo(context, error, "leave_group"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["group-leaderboard"] }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
  return { list, paging, detail, create, update, archive, respond, leave, removeInvitation };
}
