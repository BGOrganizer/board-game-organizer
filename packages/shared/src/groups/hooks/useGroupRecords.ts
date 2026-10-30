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
  notifyManager,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useOptimisticBusy } from "../../common/hooks/useOptimisticBusy";
import type { MutationFeedbackAction } from "../../common/mutationFeedback";
import {
  beginOptimisticOperation,
  cancelOptimisticResource,
  optimisticBaseData,
  optimisticFailureAction,
  optimisticOperationSignal,
  updateOptimisticBase,
} from "../../common/optimisticOperation";
import {
  type CommunityApiOptions,
  communityAccessDenied,
  communityPagePath,
  communityRequest,
} from "../../community/communityApi";
import { mapCommunityCache, versionedCommunityChange } from "../../community/queryCache";
import type { ContactUser } from "../../contacts/hooks/useContacts";
import { revokeCachedGroupAccess } from "../groupAccessCache";
import { belongsToDeletedGroup, removeDeletedGroupData } from "../groupDeletionCache";
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
      ([key, data]) =>
        (optimisticBaseData(client, key) as typeof data)?.pages.flatMap((page) =>
          page.items.map((row) => ({ row, key })),
        ) ?? [],
    )
    .find((item) => item.row.id === id);
  return useQuery({
    ...groupRecordDetailQuery(options, id, review),
    ...(cached
      ? {
          initialData: cached.row,
          initialDataUpdatedAt: client.getQueryState(cached.key)?.isInvalidated
            ? 0
            : client.getQueryState(cached.key)?.dataUpdatedAt,
        }
      : {}),
  });
}
export function groupPeopleQuery(
  options: CommunityApiOptions,
  id: string,
  mode: GroupPeopleScope = "accepted",
  query = "",
) {
  return infiniteQueryOptions({
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
}
export function useGroupPeople(
  options: CommunityApiOptions,
  id: string,
  mode: GroupPeopleScope = "accepted",
  query = "",
) {
  const paging = useInfiniteQuery(groupPeopleQuery(options, id, mode, query));
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
export function useGroupRecordActions(options: CommunityApiOptions, groupId = "") {
  const client = useQueryClient(),
    root = groupRecordKeys.root(options);
  const resourceBusy = useOptimisticBusy(root);
  const busy = resourceBusy([...root, groupId || "new"]);
  const isBusy = (id: string) => resourceBusy([...root, id]);
  const write = <T>(id: string | undefined, path: string, method: string, input?: unknown) =>
    communityRequest<T>(
      options,
      path,
      method,
      input,
      optimisticOperationSignal(client, [...root, id || "new"]),
    );
  async function begin(
    action: MutationFeedbackAction,
    id?: string,
    groupChange?: (row: GroupRecordResponse) => GroupRecordResponse,
    personChange?: (row: GroupPersonResponse) => GroupPersonResponse,
    inviteeId?: string,
  ) {
    type Row =
      | GroupRecordResponse
      | GroupPersonResponse
      | (ContactUser & { optimisticInvited?: boolean });
    const guarded = versionedCommunityChange<Row>(
      (row, key) => {
        if (
          groupChange &&
          "approved" in row &&
          row.id === id &&
          (key[3] === "list" || (key[3] === "detail" && key.length === 5))
        )
          return groupChange(row);
        if (inviteeId && key[3] === "invitees" && "id" in row && row.id === inviteeId)
          return { ...row, optimisticInvited: true };
        if (personChange && key[3] === "people" && "userId" in row) return personChange(row);
        return row;
      },
      (row) =>
        "userId" in row
          ? `person:${row.userId}`
          : `${"approved" in row ? "group" : "invitee"}:${row.id}`,
    );
    const operation = await beginOptimisticOperation(
      client,
      [...root, id || "new"],
      {
        queryKey: root,
        predicate: (query) => query.queryKey[3] === "list" || query.queryKey[4] === id,
      },
      (data, key) =>
        action === "delete_group" && id && key[3] === "list"
          ? removeDeletedGroupData(data, id, new Set())
          : ["list", "detail", "invitees", "people"].includes(String(key[3]))
            ? guarded.change(data, key)
            : data,
      [],
      (key) => {
        // A rejected write alone does not imply lost read access. A fresh denial
        // of the ordinary Group detail does; review permissions are independent.
        if (id && key[3] === "detail" && key[4] === id && key.length === 5)
          revokeCachedGroupAccess(client, options, id, false);
      },
    );
    guarded.seal();
    if (operation.modified) options.feedback?.onOptimisticUpdate?.(action);
    return {
      operation,
      announced: operation.modified,
      guarded,
      action,
      id,
      owner: { apiUrl: options.apiUrl, userId: options.userId },
      requestOptions: options,
    };
  }
  async function failure(error: Error, context: Awaited<ReturnType<typeof begin>> | undefined) {
    if (context?.operation.active)
      context.requestOptions.feedback?.onError?.(
        error,
        optimisticFailureAction(error, context.action),
      );
    await context?.operation.reject(error);
  }
  function complete(context: Awaited<ReturnType<typeof begin>> | undefined) {
    if (!context?.operation.active) return;
    context.operation.commit();
    if (!context.announced) context.requestOptions.feedback?.onSuccess?.(context.action);
  }
  function settle(
    _data: unknown,
    _error: Error | null,
    _input: unknown,
    context: Awaited<ReturnType<typeof begin>> | undefined,
  ) {
    const owner = context?.owner ?? options;
    void client.invalidateQueries(
      {
        queryKey: groupRecordKeys.root(owner),
        predicate: (query) => query.queryKey[3] === "list" || query.queryKey[4] === context?.id,
      },
      { cancelRefetch: false },
    );
    void client.invalidateQueries({
      predicate: (query) =>
        ["events", "tables"].includes(String(query.queryKey[0])) &&
        query.queryKey[1] === owner.apiUrl &&
        query.queryKey[2] === owner.userId &&
        (query.queryKey[3] === "list" ||
          Boolean(
            query.state.data &&
              typeof query.state.data === "object" &&
              "groupId" in query.state.data &&
              query.state.data.groupId === context?.id,
          )),
    });
  }
  function reconcile(
    row: GroupRecordResponse,
    _input: unknown,
    context: Awaited<ReturnType<typeof begin>> | undefined,
  ) {
    if (!context?.operation.active) return;
    for (const [key] of client.getQueriesData({ queryKey: groupRecordKeys.root(context.owner) }))
      if (key[3] === "list")
        updateOptimisticBase(client, key, (data) =>
          mapCommunityCache<GroupRecordResponse>(data, (value) =>
            value.id === row.id && value.version <= row.version ? row : value,
          ),
        );
    updateOptimisticBase(client, groupRecordKeys.detail(context.owner, row.id), (current) =>
      current && (current as GroupRecordResponse).version > row.version ? current : row,
    );
    complete(context);
  }
  function membershipSuccess(...args: Parameters<typeof reconcileMembership>) {
    void reconcileMembership(...args);
  }
  async function reconcileMembership(
    value: unknown,
    _input: unknown,
    context: Awaited<ReturnType<typeof begin>> | undefined,
  ) {
    if (!context?.operation.active || !context.id) return;
    try {
      context.operation.acknowledge();
      notifyManager.batch(() => {
        if (
          value &&
          typeof value === "object" &&
          "status" in value &&
          "groupId" in value &&
          value.groupId === context.id
        ) {
          const membership = value as GroupMembership;
          for (const [key] of client.getQueriesData({
            queryKey: groupRecordKeys.root(context.owner),
          })) {
            if (key[4] === context.id && key[3] === "people")
              updateOptimisticBase(client, key, (data) =>
                context.guarded.apply<GroupPersonResponse>(data, key, (person) =>
                  person.userId === membership.userId &&
                  (!person.membership || person.membership.version <= membership.version)
                    ? { ...person, membership }
                    : person,
                ),
              );
            if (
              membership.userId === context.owner.userId &&
              (key[3] === "list" ||
                (key[3] === "detail" && key[4] === context.id && key.length === 5))
            ) {
              updateOptimisticBase(client, key, (data) => {
                let acknowledged = false;
                const revoked = membership.status === "LEFT" || membership.status === "DECLINED";
                const updated = context.guarded.apply<GroupRecordResponse>(data, key, (row) => {
                  if (row.id !== context.id || row.role === "admin") return row;
                  if ((row.myMembership?.version ?? 0) > membership.version) return row;
                  acknowledged = true;
                  return {
                    ...row,
                    myMembership: membership,
                    role:
                      membership.status === "ACCEPTED"
                        ? "accepted"
                        : membership.status === "PENDING"
                          ? membership.kind === "INVITATION"
                            ? "invited"
                            : "requested"
                          : "none",
                    ...(revoked
                      ? {
                          canViewEvents: false,
                          canViewRankings: false,
                          canSocialInteract: false,
                          canInvite: false,
                          canEdit: false,
                          canViewMembers: row.type === "PUBLIC" && row.canViewMembers,
                        }
                      : {}),
                  };
                });
                return revoked && acknowledged && key[3] === "list" && key[4] === "mine"
                  ? removeDeletedGroupData(updated, membership.groupId, new Set())
                  : updated;
              });
            }
          }
        }
      });
      if (!context.announced) {
        context.requestOptions.feedback?.onSuccess?.(context.action);
        context.announced = true;
      }
      const query = groupRecordDetailQuery(context.requestOptions, context.id);
      const current = await context.operation.read(query.queryKey, () =>
        client.fetchQuery({
          ...query,
          staleTime: 0,
          retry: false,
        }),
      );
      if (!current.canViewEvents) revokeCachedGroupAccess(client, context.owner, context.id, true);
      reconcile(current, undefined, context);
    } catch (error) {
      if (!context.operation.active) return;
      if (communityAccessDenied(error)) {
        revokeCachedGroupAccess(client, context.owner, context.id, false);
        complete(context);
        return;
      }
      // ACKed membership is in the base. Keep only this Group locked if the
      // authoritative permissions/version cannot yet be read back.
      if (!context.announced) context.requestOptions.feedback?.onSuccess?.(context.action);
      if (!communityAccessDenied(error))
        context.requestOptions.feedback?.onError?.(
          error instanceof Error ? error : new Error("Refresh failed"),
          "refresh_saved_changes",
        );
      await context.operation.reject(error instanceof Error ? error : new Error("Refresh failed"));
    }
  }
  const create = useMutation({
    mutationKey: root,
    mutationFn: (input: CreateGroupRecordInput) =>
      write<GroupRecordResponse>(undefined, "groups", "POST", input),
    onMutate: (input) => begin(input.type === "PUBLIC" ? "submit_group_review" : "create_group"),
    onSuccess: reconcile,
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const update = useMutation({
    mutationKey: root,
    mutationFn: ({ id, input }: { id: string; input: EditGroupRecordInput }) =>
      write<GroupRecordResponse>(id, `groups/${encodeURIComponent(id)}`, "PATCH", input),
    onMutate: ({ id, input }) => begin("update_group", id, (row) => ({ ...row, name: input.name })),
    onSuccess: reconcile,
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const remove = useMutation({
    mutationKey: root,
    mutationFn: ({ id, input }: { id: string; input: DeleteGroupRecordInput }) =>
      write<DeletedGroupRecordResponse>(id, `groups/${encodeURIComponent(id)}`, "DELETE", input),
    onMutate: ({ id }) => begin("delete_group", id),
    onSuccess: async (deleted, _input, context) => {
      if (!context?.operation.active) return;
      complete(context);
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
      notifyManager.batch(() => {
        for (const eventId of eventIds)
          cancelOptimisticResource(client, ["events", owner.apiUrl, owner.userId, eventId]);
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
            updateOptimisticBase(client, key, (data) =>
              removeDeletedGroupData(data, deleted.id, eventIds),
            );
        }
      });
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
      write<GroupRecordResponse>(id, `groups/${encodeURIComponent(id)}/review`, "PATCH", input),
    onMutate: ({ id, input }) =>
      begin(input.decision === "approve" ? "approve_group" : "reject_group", id),
    onSuccess: (row, _input, context) => {
      if (!context?.operation.active) return;
      updateOptimisticBase(
        client,
        groupRecordKeys.detail(context.owner, row.id, true),
        (current) =>
          current && (current as GroupRecordResponse).version > row.version ? current : row,
      );
      complete(context);
    },
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const requestJoin = useMutation({
    mutationKey: root,
    mutationFn: (id: string) =>
      write<GroupMembership>(id, `groups/${encodeURIComponent(id)}/membership`, "POST", {}),
    onMutate: (id) => begin("request_group_join", id),
    onSuccess: membershipSuccess,
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const invite = useMutation({
    mutationKey: root,
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      write<GroupMembership>(id, `groups/${encodeURIComponent(id)}/members`, "POST", { userId }),
    onMutate: ({ id, userId }) => begin("invite_group_member", id, undefined, undefined, userId),
    onSuccess: membershipSuccess,
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
      write<GroupMembership>(
        id,
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
    onSuccess: membershipSuccess,
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const ban = useMutation({
    mutationKey: root,
    mutationFn: ({ id, input }: { id: string; input: BanGroupUserInput }) =>
      write<GroupBan>(id, `groups/${encodeURIComponent(id)}/bans`, "POST", input),
    onMutate: ({ id, input }) =>
      begin("ban_group_member", id, undefined, (person) =>
        person.userId === input.userId && person.membership
          ? { ...person, membership: { ...person.membership, status: "LEFT" } }
          : person,
      ),
    onSuccess: membershipSuccess,
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const revoke = useMutation({
    mutationKey: root,
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      write<GroupBan>(
        id,
        `groups/${encodeURIComponent(id)}/bans/${encodeURIComponent(userId)}`,
        "DELETE",
      ),
    onMutate: ({ id }) => begin("revoke_group_ban", id),
    onSuccess: membershipSuccess,
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  return {
    create,
    update,
    remove,
    review,
    requestJoin,
    invite,
    membership,
    ban,
    revoke,
    busy,
    isBusy,
  };
}
