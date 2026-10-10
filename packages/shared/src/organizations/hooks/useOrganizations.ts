import type {
  CommunityPageResponse,
  OrganizationListRole,
  OrganizationMemberResponse,
  OrganizationMembership,
  OrganizationMembershipAction,
  OrganizationResponse,
  ReviewOrganizationInput,
  SaveOrganizationInput,
  UpdateOrganizationInput,
} from "@board-game-organizer/schemas";
import { organizationListRoles } from "@board-game-organizer/schemas";
import {
  type InfiniteData,
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

export const organizationKeys = {
  root: (options: CommunityApiOptions) =>
    ["organizations", options.apiUrl, options.userId] as const,
  list: (
    options: CommunityApiOptions,
    scope: string,
    query: string,
    roles: readonly OrganizationListRole[] = organizationListRoles,
  ) => {
    const selected = organizationListRoles.filter((role) => roles.includes(role));
    return [
      ...organizationKeys.root(options),
      "list",
      scope,
      query,
      ...(scope === "mine" && selected.length !== organizationListRoles.length
        ? [selected.join(",")]
        : []),
    ] as const;
  },
  detail: (options: CommunityApiOptions, id: string) =>
    [...organizationKeys.root(options), "detail", id] as const,
  members: (options: CommunityApiOptions, id: string, mode: string, query: string) =>
    [...organizationKeys.root(options), "members", id, mode, query] as const,
};
export type OrganizationScope = "mine" | "public" | "moderation";
export type OrganizationMemberMode = "accepted" | "pending" | "excluded";
export function organizationsPageQuery(
  options: CommunityApiOptions,
  scope: OrganizationScope = "mine",
  query = "",
  roles: readonly OrganizationListRole[] = organizationListRoles,
) {
  const selected = organizationListRoles.filter((role) => roles.includes(role));
  return infiniteQueryOptions({
    queryKey: organizationKeys.list(options, scope, query, selected),
    queryFn: ({ pageParam, signal }) =>
      communityRequest<CommunityPageResponse<OrganizationResponse>>(
        options,
        communityPagePath(
          `organizations?scope=${scope}${scope === "mine" && selected.length !== organizationListRoles.length ? `&roles=${selected.join(",")}` : ""}`,
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
export function useOrganizationList(
  options: CommunityApiOptions,
  scope: OrganizationScope = "mine",
  query = "",
  roles: readonly OrganizationListRole[] = organizationListRoles,
) {
  const paging = useInfiniteQuery(organizationsPageQuery(options, scope, query, roles));
  return { ...paging, items: paging.data?.pages.flatMap((page) => page.items) ?? [] };
}
export function organizationDetailQuery(options: CommunityApiOptions, id: string) {
  return queryOptions({
    queryKey: organizationKeys.detail(options, id),
    queryFn: ({ signal }) =>
      communityRequest<OrganizationResponse>(
        options,
        `organizations/${encodeURIComponent(id)}`,
        "GET",
        undefined,
        signal,
      ),
    enabled: Boolean(options.apiUrl && options.userId && id && options.enabled !== false),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
export function useOrganization(options: CommunityApiOptions, id: string) {
  const client = useQueryClient();
  return useQuery({
    ...organizationDetailQuery(options, id),
    initialData: () =>
      client
        .getQueryData<InfiniteData<CommunityPageResponse<OrganizationResponse>>>(
          organizationKeys.list(options, "mine", ""),
        )
        ?.pages.flatMap((page) => page.items)
        .find((row) => row.id === id),
    initialDataUpdatedAt: () =>
      client.getQueryState(organizationKeys.list(options, "mine", ""))?.dataUpdatedAt,
  });
}
export function useOrganizationReview(options: CommunityApiOptions, id: string) {
  return useQuery({
    queryKey: [...organizationKeys.detail(options, id), "review"],
    queryFn: ({ signal }) =>
      communityRequest<OrganizationResponse>(
        options,
        `organizations/${encodeURIComponent(id)}/review`,
        "GET",
        undefined,
        signal,
      ),
    enabled: Boolean(options.apiUrl && options.userId && id && options.enabled !== false),
    staleTime: 0,
    gcTime: 5 * 60_000,
  });
}
export function useOrganizationMembers(
  options: CommunityApiOptions,
  id: string,
  mode: OrganizationMemberMode = "accepted",
  query = "",
) {
  const paging = useInfiniteQuery({
    queryKey: organizationKeys.members(options, id, mode, query),
    queryFn: ({ pageParam, signal }) =>
      communityRequest<CommunityPageResponse<OrganizationMemberResponse>>(
        options,
        communityPagePath(
          `organizations/${encodeURIComponent(id)}/members?mode=${mode}`,
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
  return { ...paging, items: paging.data?.pages.flatMap((page) => page.items) ?? [] };
}
/** Only organization detail/list DTOs: never rewrite member pages or foreign user/API caches. */
export function patchOrganizationData(
  data: unknown,
  patch: (row: OrganizationResponse) => OrganizationResponse | null,
): unknown {
  if (!data || typeof data !== "object") return data;
  if ("id" in data) return patch(data as OrganizationResponse) ?? data;
  if (!("pages" in data) || !Array.isArray(data.pages)) return data;
  const source = data as InfiniteData<CommunityPageResponse<OrganizationResponse>>;
  return {
    ...source,
    pages: source.pages.map((page) => ({
      ...page,
      items: page.items.flatMap((row) => {
        const next = patch(row);
        return next ? [next] : [];
      }),
    })),
  };
}
export function patchOrganizationMemberData(
  data: unknown,
  patch: (person: OrganizationMemberResponse) => OrganizationMemberResponse | null,
) {
  if (!data || typeof data !== "object" || !("pages" in data) || !Array.isArray(data.pages))
    return data;
  const source = data as InfiniteData<CommunityPageResponse<OrganizationMemberResponse>>;
  return {
    ...source,
    pages: source.pages.map((page) => ({
      ...page,
      items: page.items.flatMap((person) => {
        const next = patch(person);
        return next ? [next] : [];
      }),
    })),
  };
}
export function restoreRemovedOrganizationMember(
  current: InfiniteData<CommunityPageResponse<OrganizationMemberResponse>> | undefined,
  previous: InfiniteData<CommunityPageResponse<OrganizationMemberResponse>> | undefined,
  userId: string,
) {
  // Do not recreate cleared private caches or overwrite concurrent page/social updates.
  if (
    !current ||
    !previous ||
    current.pages.some((page) => page.items.some((row) => row.userId === userId))
  )
    return current;
  return {
    ...current,
    pages: current.pages.map((page, index) => {
      const oldPage = previous.pages[index];
      const position = oldPage?.items.findIndex((row) => row.userId === userId) ?? -1;
      if (position < 0) return page;
      const items = [...page.items];
      items.splice(Math.min(position, items.length), 0, oldPage.items[position]);
      return { ...page, items };
    }),
  };
}
export function organizationMatchesList(row: OrganizationResponse, key: readonly unknown[]) {
  if (key[3] !== "list") return true;
  if (key[4] === "mine") {
    const roles = key[6] === undefined ? organizationListRoles : String(key[6]).split(",");
    if (!roles.some((role) => role === row.role)) return false;
  }
  return row.name.toLocaleLowerCase().includes(String(key[5] ?? "").toLocaleLowerCase());
}
export function useOrganizationActions(options: CommunityApiOptions) {
  const client = useQueryClient();
  const root = organizationKeys.root(options);
  const busy = useIsMutating({ mutationKey: root }) > 0;
  async function begin(
    action: MutationFeedbackAction,
    patch?: (row: OrganizationResponse) => OrganizationResponse | null,
    memberChange?: { id: string; userId: string },
  ) {
    await client.cancelQueries({ queryKey: root });
    const snapshots = client
      .getQueriesData({ queryKey: root })
      .filter(
        ([key]) =>
          (key[3] === "detail" && key.length === 5) ||
          key[3] === "list" ||
          (key[3] === "members" && key[4] === memberChange?.id),
      );
    for (const [key, data] of snapshots) {
      if (key[3] === "members" && memberChange) {
        client.setQueryData(
          key,
          patchOrganizationMemberData(data, (person) =>
            person.userId === memberChange.userId ? null : person,
          ),
        );
      } else if (patch) {
        client.setQueryData(
          key,
          patchOrganizationData(data, (row) => {
            const next = patch(row);
            return next && organizationMatchesList(next, key) ? next : null;
          }),
        );
      }
    }
    options.feedback?.onOptimisticUpdate?.(action);
    return { snapshots, action, memberChange };
  }
  function undo(error: Error, context: Awaited<ReturnType<typeof begin>> | undefined) {
    for (const [key, data] of context?.snapshots ?? []) {
      if (key[3] === "members" && context?.memberChange) {
        const { userId } = context.memberChange;
        client.setQueryData(
          key,
          (current: InfiniteData<CommunityPageResponse<OrganizationMemberResponse>> | undefined) =>
            restoreRemovedOrganizationMember(current, data as typeof current, userId),
        );
      } else client.setQueryData(key, data);
    }
    if (context) options.feedback?.onError?.(error, context.action);
  }
  async function settle() {
    await client.invalidateQueries({ queryKey: root });
    await client.invalidateQueries({ queryKey: ["events", options.apiUrl, options.userId] });
    await client.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "matches" &&
        query.queryKey.includes(options.apiUrl) &&
        query.queryKey.includes(options.userId),
      refetchType: "none",
    });
  }
  function reconcile(row: OrganizationResponse) {
    for (const [key, data] of client.getQueriesData({ queryKey: root }))
      if (key[3] === "list") {
        client.setQueryData(
          key,
          patchOrganizationData(data, (item) => {
            const next = item.id === row.id ? row : item;
            return organizationMatchesList(next, key) ? next : null;
          }),
        );
      }
    client.setQueryData(organizationKeys.detail(options, row.id), row);
  }
  const create = useMutation({
    mutationKey: root,
    mutationFn: (input: SaveOrganizationInput) =>
      communityRequest<OrganizationResponse>(options, "organizations", "POST", input),
    onMutate: () => begin("create_organization"),
    onError: (error, _input, context) => undo(error, context),
    onSuccess: reconcile,
    onSettled: settle,
  });
  const update = useMutation({
    mutationKey: root,
    mutationFn: ({ id, input }: { id: string; input: UpdateOrganizationInput }) =>
      communityRequest<OrganizationResponse>(
        options,
        `organizations/${encodeURIComponent(id)}`,
        "PATCH",
        input,
      ),
    onMutate: ({ id, input }) =>
      begin("update_organization", (row) =>
        row.id === id && row.role === "admin"
          ? { ...row, name: input.name, location: input.location, logoAssetId: input.logoAssetId }
          : row,
      ),
    onError: (error, _input, context) => undo(error, context),
    onSuccess: reconcile,
    onSettled: settle,
  });
  const review = useMutation({
    mutationKey: root,
    mutationFn: ({ id, input }: { id: string; input: ReviewOrganizationInput }) =>
      communityRequest<OrganizationResponse>(
        options,
        `organizations/${encodeURIComponent(id)}/review`,
        "PATCH",
        input,
      ),
    onMutate: ({ input }) =>
      begin(input.decision === "approve" ? "approve_organization" : "reject_organization"),
    onError: (error, _input, context) => undo(error, context),
    onSettled: settle,
  });
  const requestJoin = useMutation({
    mutationKey: root,
    mutationFn: (id: string) =>
      communityRequest<OrganizationMembership>(
        options,
        `organizations/${encodeURIComponent(id)}/membership`,
        "POST",
        {},
      ),
    onMutate: (id) =>
      begin("request_organization_join", (row) =>
        row.id === id && row.role === "none" ? { ...row, role: "requested" } : row,
      ),
    onError: (error, _input, context) => undo(error, context),
    onSettled: settle,
  });
  const invite = useMutation({
    mutationKey: root,
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      communityRequest<OrganizationMembership>(
        options,
        `organizations/${encodeURIComponent(id)}/members`,
        "POST",
        { userId },
      ),
    onMutate: () => begin("invite_organization_member"),
    onError: (error, _input, context) => undo(error, context),
    onSettled: settle,
  });
  const membership = useMutation({
    mutationKey: root,
    mutationFn: ({
      id,
      userId,
      action,
    }: {
      id: string;
      userId: string;
      action: OrganizationMembershipAction["action"];
    }) =>
      communityRequest<OrganizationMembership>(
        options,
        `organizations/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
        "PATCH",
        { action },
      ),
    onMutate: ({ id, userId, action }) =>
      begin(
        organizationMembershipFeedback(action),
        (row) => {
          if (row.id !== id || userId !== options.userId) return row;
          // Revocations are safe optimistically; acceptance never grants unconfirmed private access.
          return action === "cancel" || action === "decline"
            ? { ...row, role: "none", myMembership: null }
            : row;
        },
        action === "accept" ? undefined : { id, userId },
      ),
    onError: (error, _input, context) => undo(error, context),
    onSettled: settle,
  });
  return { create, update, review, requestJoin, invite, membership, busy };
}
export function organizationMembershipFeedback(
  action: OrganizationMembershipAction["action"],
): MutationFeedbackAction {
  return {
    accept: "accept_organization_invitation",
    decline: "decline_organization_invitation",
    approve: "approve_organization_join",
    reject: "reject_organization_join",
    cancel: "leave_organization",
    remove: "remove_organization_member",
    ban: "ban_organization_member",
    revoke: "revoke_organization_exclusion",
  }[action] as MutationFeedbackAction;
}
