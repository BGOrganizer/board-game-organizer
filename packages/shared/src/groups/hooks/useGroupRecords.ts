import type {
  BanGroupUserInput,
  CommunityPageResponse,
  CreateGroupRecordInput,
  DecideGroupMembershipInput,
  DecideGroupReviewInput,
  DeletedGroupRecordResponse,
  DeleteGroupRecordInput,
  EditGroupRecordInput,
  GroupBan,
  GroupMembership,
  GroupPersonResponse,
  GroupRecordListRole,
  GroupRecordResponse,
} from "@board-game-organizer/schemas";
import { groupRecordListRoles } from "@board-game-organizer/schemas";
import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { MutationFeedbackAction } from "../../common/mutationFeedback";
import {
  type CommunityApiOptions,
  communityPagePath,
  communityRequest,
} from "../../community/communityApi";
import { mapCommunityCache, restoreCommunityFields } from "../../community/queryCache";
import type { ContactUser } from "../../contacts/hooks/useContacts";
import {
  belongsToDeletedGroup,
  removeDeletedGroupData,
  restoreDeletedGroup,
} from "../groupDeletionCache";
export type GroupRecordScope = "mine" | "public" | "moderation";
export type GroupPeopleScope = "accepted" | "pending" | "bans";
type KeyOwner = Pick<CommunityApiOptions, "apiUrl" | "userId">;
export const groupRecordKeys = {
  root: (options: KeyOwner) => ["groups", options.apiUrl, options.userId] as const,
  list: (
    options: KeyOwner,
    scope: GroupRecordScope,
    query = "",
    roles: readonly GroupRecordListRole[] = groupRecordListRoles,
  ) =>
    [
      ...groupRecordKeys.root(options),
      "list",
      scope,
      query,
      ...(scope === "mine"
        ? [groupRecordListRoles.filter((role) => roles.includes(role)).join(",")]
        : []),
    ] as const,
  detail: (options: KeyOwner, id: string, review = false) =>
    [...groupRecordKeys.root(options), "detail", id, ...(review ? ["review"] : [])] as const,
  people: (options: CommunityApiOptions, id: string, mode: GroupPeopleScope, query: string) =>
    [...groupRecordKeys.root(options), "people", id, mode, query] as const,
};
export function groupRecordsPageQuery(
  options: CommunityApiOptions,
  scope: GroupRecordScope = "mine",
  query = "",
  roles: readonly GroupRecordListRole[] = groupRecordListRoles,
) {
  const selected = groupRecordListRoles.filter((role) => roles.includes(role));
  return infiniteQueryOptions({
    queryKey: groupRecordKeys.list(options, scope, query, selected),
    queryFn: ({ pageParam, signal }) =>
      communityRequest<CommunityPageResponse<GroupRecordResponse>>(
        options,
        communityPagePath(
          `groups?scope=${scope}${scope === "mine" ? `&roles=${selected.join(",")}` : ""}`,
          query,
          pageParam,
        ),
        "GET",
        undefined,
        signal,
      ),
    enabled: Boolean(
      options.apiUrl &&
        options.userId &&
        options.enabled !== false &&
        (scope !== "public" || query.length >= 4),
    ),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
export function groupInviteesPageQuery(options: CommunityApiOptions, id: string, query = "") {
  return infiniteQueryOptions({
    queryKey: [...groupRecordKeys.root(options), "invitees", id, query],
    queryFn: ({ pageParam, signal }) =>
      communityRequest<CommunityPageResponse<ContactUser & { optimisticInvited?: boolean }>>(
        options,
        communityPagePath(`groups/${encodeURIComponent(id)}/invitees`, query, pageParam),
        "GET",
        undefined,
        signal,
      ),
    enabled: Boolean(options.apiUrl && options.userId && id && options.enabled !== false),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
  });
}
export function useGroupRecords(
  options: CommunityApiOptions,
  scope: GroupRecordScope = "mine",
  query = "",
  roles: readonly GroupRecordListRole[] = groupRecordListRoles,
) {
  const paging = useInfiniteQuery(groupRecordsPageQuery(options, scope, query, roles));
  return { ...paging, items: paging.data?.pages.flatMap((page) => page.items) ?? [] };
}
export function groupRecordDetailQuery(options: CommunityApiOptions, id: string, review = false) {
  return queryOptions({
    queryKey: groupRecordKeys.detail(options, id, review),
    queryFn: ({ signal }) =>
      communityRequest<GroupRecordResponse>(
        options,
        `groups/${encodeURIComponent(id)}${review ? "/review" : ""}`,
        "GET",
        undefined,
        signal,
      ),
    enabled: Boolean(options.apiUrl && options.userId && id && options.enabled !== false),
    staleTime: review ? 0 : 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
export function useGroupRecord(options: CommunityApiOptions, id: string, review = false) {
  const client = useQueryClient();
  // List responses contain every group-detail field. Moderator proposals are never seeded from ordinary lists.
  const lists = review
    ? []
    : client.getQueriesData<{ pages: Array<CommunityPageResponse<GroupRecordResponse>> }>({
        queryKey: groupRecordKeys.root(options),
        predicate: (query) => query.queryKey[3] === "list" && query.queryKey[4] !== "moderation",
      });
  const cached = lists
    .flatMap(
      ([key, data]) => data?.pages.flatMap((page) => page.items.map((row) => ({ row, key }))) ?? [],
    )
    .find((item) => item.row.id === id);
  return useQuery({
    ...groupRecordDetailQuery(options, id, review),
    ...(cached
      ? {
          initialData: cached.row,
          initialDataUpdatedAt: client.getQueryState(cached.key)?.dataUpdatedAt,
        }
      : {}),
  });
}
export function useGroupPeople(
  options: CommunityApiOptions,
  id: string,
  mode: GroupPeopleScope = "accepted",
  query = "",
) {
  const paging = useInfiniteQuery({
    queryKey: groupRecordKeys.people(options, id, mode, query),
    queryFn: ({ pageParam, signal }) =>
      communityRequest<CommunityPageResponse<GroupPersonResponse>>(
        options,
        communityPagePath(
          `groups/${encodeURIComponent(id)}/members?mode=${mode}`,
          query,
          pageParam,
        ),
        "GET",
        undefined,
        signal,
      ),
    enabled: Boolean(options.apiUrl && options.userId && id && options.enabled !== false),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  return {
    ...paging,
    items:
      paging.data?.pages
        .flatMap((page) => page.items)
        .filter((person) =>
          mode === "bans"
            ? Boolean(person.ban)
            : person.isAdmin ||
              person.membership?.status === (mode === "accepted" ? "ACCEPTED" : "PENDING"),
        ) ?? [],
  };
}
export function groupMembershipFeedback(
  action: DecideGroupMembershipInput["action"],
): MutationFeedbackAction {
  return {
    accept: "accept_group_invitation",
    decline: "decline_group_invitation",
    approve: "approve_group_join",
    reject: "reject_group_join",
    cancel: "leave_group",
    remove: "remove_group_member",
  }[action] as MutationFeedbackAction;
}
export function useGroupRecordActions(options: CommunityApiOptions) {
  const client = useQueryClient(),
    root = groupRecordKeys.root(options);
  const busy = useIsMutating({ mutationKey: root }) > 0;
  async function begin(
    action: MutationFeedbackAction,
    id?: string,
    groupChange?: (row: GroupRecordResponse) => GroupRecordResponse,
    personChange?: (row: GroupPersonResponse) => GroupPersonResponse,
    inviteeId?: string,
  ) {
    await client.cancelQueries({
      queryKey: root,
      predicate: (query) => query.queryKey[3] === "list" || query.queryKey[4] === id,
    });
    const undo: Array<() => void> = [];
    for (const [key, data] of client.getQueriesData({ queryKey: root })) {
      if (action === "delete_group" && id && key[3] === "list") {
        client.setQueryData(key, removeDeletedGroupData(data, id, new Set()));
        undo.push(() =>
          client.setQueryData(key, (current: unknown) =>
            restoreDeletedGroup(
              current,
              data,
              id,
              client.getQueryData<GroupRecordResponse>(groupRecordKeys.detail(options, id)),
            ),
          ),
        );
      }
      if (
        groupChange &&
        (key[3] === "list" || (key[3] === "detail" && key[4] === id && key.length === 5))
      )
        client.setQueryData(
          key,
          mapCommunityCache<GroupRecordResponse>(data, (row) => {
            if (row.id !== id) return row;
            const optimistic = groupChange(row);
            undo.push(() =>
              client.setQueryData(key, (current: unknown) =>
                mapCommunityCache<GroupRecordResponse>(current, (value) =>
                  value.id === id ? restoreCommunityFields(value, row, optimistic) : value,
                ),
              ),
            );
            return optimistic;
          }),
        );
      if (inviteeId && key[3] === "invitees" && key[4] === id) {
        type Candidate = ContactUser & { optimisticInvited?: boolean };
        client.setQueryData(
          key,
          mapCommunityCache<Candidate>(data, (row) => {
            if (row.id !== inviteeId) return row;
            const optimistic = { ...row, optimisticInvited: true };
            undo.push(() =>
              client.setQueryData(key, (current: unknown) =>
                mapCommunityCache<Candidate>(current, (value) =>
                  value.id === inviteeId ? restoreCommunityFields(value, row, optimistic) : value,
                ),
              ),
            );
            return optimistic;
          }),
        );
      }
      if (personChange && key[3] === "people" && key[4] === id)
        client.setQueryData(
          key,
          mapCommunityCache<GroupPersonResponse>(data, (row) => {
            const optimistic = personChange(row);
            if (optimistic === row) return row;
            undo.push(() =>
              client.setQueryData(key, (current: unknown) =>
                mapCommunityCache<GroupPersonResponse>(current, (value) =>
                  value.userId === row.userId
                    ? restoreCommunityFields(value, row, optimistic)
                    : value,
                ),
              ),
            );
            return optimistic;
          }),
        );
    }
    options.feedback?.onOptimisticUpdate?.(action);
    return { undo, action, id, owner: { apiUrl: options.apiUrl, userId: options.userId } };
  }
  function failure(error: Error, context: Awaited<ReturnType<typeof begin>> | undefined) {
    for (const restore of context?.undo ?? []) restore();
    if (context) options.feedback?.onError?.(error, context.action);
  }
  async function settle(
    _data: unknown,
    _error: Error | null,
    _input: unknown,
    context: Awaited<ReturnType<typeof begin>> | undefined,
  ) {
    await client.invalidateQueries({
      queryKey: root,
      predicate: (query) => query.queryKey[3] === "list" || query.queryKey[4] === context?.id,
    });
    await client.invalidateQueries({
      predicate: (query) =>
        ["events", "tables"].includes(String(query.queryKey[0])) &&
        query.queryKey[1] === options.apiUrl &&
        query.queryKey[2] === options.userId &&
        (query.queryKey[3] === "list" ||
          Boolean(
            query.state.data &&
              typeof query.state.data === "object" &&
              "groupId" in query.state.data &&
              query.state.data.groupId === context?.id,
          )),
    });
  }
  function reconcile(row: GroupRecordResponse) {
    for (const [key, data] of client.getQueriesData({ queryKey: root }))
      if (key[3] === "list")
        client.setQueryData(
          key,
          mapCommunityCache<GroupRecordResponse>(data, (value) =>
            value.id === row.id ? row : value,
          ),
        );
    client.setQueryData(groupRecordKeys.detail(options, row.id), row);
  }
  const create = useMutation({
    mutationKey: root,
    mutationFn: (input: CreateGroupRecordInput) =>
      communityRequest<GroupRecordResponse>(options, "groups", "POST", input),
    onMutate: (input) => begin(input.type === "PUBLIC" ? "submit_group_review" : "create_group"),
    onSuccess: reconcile,
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const update = useMutation({
    mutationKey: root,
    mutationFn: ({ id, input }: { id: string; input: EditGroupRecordInput }) =>
      communityRequest<GroupRecordResponse>(
        options,
        `groups/${encodeURIComponent(id)}`,
        "PATCH",
        input,
      ),
    onMutate: ({ id, input }) => begin("update_group", id, (row) => ({ ...row, name: input.name })),
    onSuccess: reconcile,
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const remove = useMutation({
    mutationKey: root,
    mutationFn: ({ id, input }: { id: string; input: DeleteGroupRecordInput }) =>
      communityRequest<DeletedGroupRecordResponse>(
        options,
        `groups/${encodeURIComponent(id)}`,
        "DELETE",
        input,
      ),
    onMutate: ({ id }) => begin("delete_group", id),
    onSuccess: async (deleted, _input, context) => {
      const owner = context?.owner ?? options;
      const eventIds = new Set(deleted.eventIds);
      const owned = {
        predicate: (query: { queryKey: readonly unknown[]; state: { data: unknown } }) => {
          const key = query.queryKey;
          if (key[1] !== owner.apiUrl || key[2] !== owner.userId) return false;
          if (key[0] === "groups") return key[3] === "list" || key[4] === deleted.id;
          if (key[0] === "notifications") return true;
          if (key[0] !== "events" && key[0] !== "tables") return false;
          if (key[3] === "list") {
            const filters = key[4];
            return (
              !filters ||
              typeof filters !== "object" ||
              !("groupId" in filters) ||
              !filters.groupId ||
              filters.groupId === deleted.id
            );
          }
          return (
            (key[3] === "tables" && key[4] === null) ||
            (typeof key[4] === "string" && eventIds.has(key[4])) ||
            belongsToDeletedGroup(query.state.data, deleted.id, eventIds)
          );
        },
      };
      await client.cancelQueries(owned);
      for (const query of client.getQueryCache().findAll(owned)) {
        const key = query.queryKey;
        const groupResource = key[0] === "groups" && key[4] === deleted.id;
        const eventResource =
          key[0] === "events" && typeof key[4] === "string" && eventIds.has(key[4]);
        if (
          groupResource ||
          eventResource ||
          belongsToDeletedGroup(query.state.data, deleted.id, eventIds)
        )
          client.removeQueries({ queryKey: key, exact: true });
        else
          client.setQueryData(key, removeDeletedGroupData(query.state.data, deleted.id, eventIds));
      }
      // Acknowledged deletion already reconciles cached rows; refresh remaining lists in background.
      void client.invalidateQueries({
        predicate: (query) =>
          owned.predicate(query) &&
          (query.queryKey[0] === "notifications" ||
            (query.queryKey[0] === "groups" && query.queryKey[3] === "list") ||
            (query.queryKey[0] === "events" &&
              query.queryKey[3] === "tables" &&
              query.queryKey[4] === null) ||
            (query.queryKey[0] === "events" &&
              query.queryKey[3] === "list" &&
              !(
                typeof query.queryKey[4] === "object" &&
                query.queryKey[4] &&
                "groupId" in query.queryKey[4] &&
                query.queryKey[4].groupId === deleted.id
              ))),
      });
    },
    onError: (error, _input, context) => failure(error, context),
    onSettled: (data, error, input, context) =>
      error ? settle(data, error, input, context) : undefined,
  });
  const review = useMutation({
    mutationKey: root,
    mutationFn: ({ id, input }: { id: string; input: DecideGroupReviewInput }) =>
      communityRequest<GroupRecordResponse>(
        options,
        `groups/${encodeURIComponent(id)}/review`,
        "PATCH",
        input,
      ),
    onMutate: ({ id, input }) =>
      begin(input.decision === "approve" ? "approve_group" : "reject_group", id),
    onSuccess: (row) => client.setQueryData(groupRecordKeys.detail(options, row.id, true), row),
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const requestJoin = useMutation({
    mutationKey: root,
    mutationFn: (id: string) =>
      communityRequest<GroupMembership>(
        options,
        `groups/${encodeURIComponent(id)}/membership`,
        "POST",
        {},
      ),
    onMutate: (id) => begin("request_group_join", id),
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const invite = useMutation({
    mutationKey: root,
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      communityRequest<GroupMembership>(
        options,
        `groups/${encodeURIComponent(id)}/members`,
        "POST",
        { userId },
      ),
    onMutate: ({ id, userId }) => begin("invite_group_member", id, undefined, undefined, userId),
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const membership = useMutation({
    mutationKey: root,
    mutationFn: ({
      id,
      userId,
      input,
    }: {
      id: string;
      userId: string;
      input: DecideGroupMembershipInput;
    }) =>
      communityRequest<GroupMembership>(
        options,
        `groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
        "PATCH",
        input,
      ),
    onMutate: ({ id, userId, input }) =>
      begin(groupMembershipFeedback(input.action), id, undefined, (person) =>
        person.userId === userId &&
        person.membership &&
        (input.action === "remove" ||
          input.action === "cancel" ||
          input.action === "reject" ||
          input.action === "decline")
          ? {
              ...person,
              membership: {
                ...person.membership,
                status:
                  input.action === "decline" || input.action === "reject" ? "DECLINED" : "LEFT",
              },
            }
          : person,
      ),
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const ban = useMutation({
    mutationKey: root,
    mutationFn: ({ id, input }: { id: string; input: BanGroupUserInput }) =>
      communityRequest<GroupBan>(options, `groups/${encodeURIComponent(id)}/bans`, "POST", input),
    onMutate: ({ id, input }) =>
      begin("ban_group_member", id, undefined, (person) =>
        person.userId === input.userId && person.membership
          ? { ...person, membership: { ...person.membership, status: "LEFT" } }
          : person,
      ),
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const revoke = useMutation({
    mutationKey: root,
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      communityRequest<GroupBan>(
        options,
        `groups/${encodeURIComponent(id)}/bans/${encodeURIComponent(userId)}`,
        "DELETE",
      ),
    onMutate: ({ id }) => begin("revoke_group_ban", id),
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  return { create, update, remove, review, requestJoin, invite, membership, ban, revoke, busy };
}
