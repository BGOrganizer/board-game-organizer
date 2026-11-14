"use client";
import type { TableInviteesPageResponse } from "@board-game-organizer/schemas";
import { type InfiniteData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { clientMutationPhase } from "../../common/clientMutation";
import { useScopedMutations } from "../../common/hooks/useScopedMutations";
import {
  type CommunityApiOptions,
  communityAccessDenied,
  communityRequest,
} from "../../community/communityApi";
import { type TableInviteeIntent, tableInviteeItems } from "../../events/eventTableInvitees";
import { eventRecordKeys, tableInviteesPageQuery } from "../../events/hooks/useEventRecords";
import { groupInviteesPageQuery, groupRecordKeys } from "../../groups/hooks/useGroupRecords";
import { type ContactUser, useRelationshipList } from "./useContacts";
/** Paged identity selection; local search text remains in each platform's UI. */
export function usePeoplePicker(
  options: CommunityApiOptions,
  query: string,
  friendsOnly: boolean,
  invitationGroupId?: string,
  invitationTable?: { eventId: string; tableId: string },
) {
  const client = useQueryClient();
  const mutations = useScopedMutations({
    mutationKey: invitationTable
      ? eventRecordKeys.mutation(options, invitationTable.eventId)
      : [...groupRecordKeys.root(options), "mutation"],
  });
  const excluded = new Set(
    mutations.flatMap((mutation) => {
      if (mutation.state.status !== "pending" || mutation.options.mutationKey?.at(-1) !== "invite")
        return [];
      const input = mutation.state.variables as
        | { id?: string; tableId?: string; userId?: string }
        | undefined;
      const context = mutation.state.context as
        | { operation?: { signal?: AbortSignal } }
        | undefined;
      return input?.userId &&
        !context?.operation?.signal?.aborted &&
        (invitationTable
          ? input.tableId === invitationTable.tableId
          : input.id === invitationGroupId)
        ? [input.userId]
        : [];
    }),
  );
  const searching = query.trim().length >= 4,
    normalized = searching ? query.trim() : "";
  const friends = useRelationshipList(
    options.apiUrl,
    null,
    options.getToken,
    options.protectionBypass,
    options.userId,
    "friends",
    options.enabled !== false &&
      friendsOnly &&
      !searching &&
      !invitationGroupId &&
      !invitationTable,
  );
  const search = useInfiniteQuery({
    queryKey: ["contacts", "picker", options.apiUrl, options.userId, friendsOnly, normalized],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        query: normalized,
        friendsOnly: String(friendsOnly),
        limit: "20",
      });
      if (pageParam) params.set("cursor", pageParam);
      return communityRequest<{ users: ContactUser[]; nextCursor: string | null }>(
        options,
        `users/search?${params}`,
        "GET",
        undefined,
        signal,
      );
    },
    enabled: Boolean(
      options.userId &&
        options.apiUrl &&
        options.enabled !== false &&
        searching &&
        !invitationGroupId &&
        !invitationTable,
    ),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
  });
  const invitees = useInfiniteQuery(
    groupInviteesPageQuery(
      { ...options, enabled: options.enabled !== false && !invitationTable },
      invitationGroupId ?? "",
      normalized,
    ),
  );
  const tableInvitees = useInfiniteQuery(
    tableInviteesPageQuery(
      options,
      invitationTable?.eventId ?? "",
      invitationTable?.tableId ?? "",
      normalized,
    ),
  );
  const source = invitationTable
    ? tableInvitees
    : invitationGroupId
      ? invitees
      : searching
        ? search
        : friends;
  const needsSearch = !invitationTable && !invitationGroupId && !friendsOnly && !searching;
  const intents = mutations.flatMap<TableInviteeIntent>((mutation) => {
    if (!invitationTable) return [];
    const input = mutation.state.variables as
      | {
          tableId?: string;
          userId?: string;
          person?: TableInviteeIntent["person"];
          input?: { action?: string };
        }
      | undefined;
    if (input?.tableId !== invitationTable.tableId) return [];
    const action = mutation.options.mutationKey?.at(-1);
    const kind =
      action === "invite"
        ? "invite"
        : action === "respond" && input.input?.action === "remove"
          ? "remove"
          : null;
    const userId = kind === "invite" ? input.userId : input.person?.userId;
    if (!kind || !userId || userId === options.userId) return [];
    const context = mutation.state.context as
      | { operation?: { signal?: AbortSignal; uncertain?: boolean }; acknowledgedVersion?: number }
      | undefined;
    return [
      {
        mutationId: mutation.mutationId,
        kind,
        userId,
        person: input.person,
        status: mutation.state.status,
        failed:
          mutation.state.status === "error" &&
          clientMutationPhase("error", mutation.state.error) === "failed",
        aborted: Boolean(context?.operation?.signal?.aborted),
        uncertain: Boolean(context?.operation?.uncertain),
        acknowledgedVersion: context?.acknowledgedVersion,
      },
    ];
  });
  const tableItems =
    invitationTable && options.enabled !== false && !communityAccessDenied(tableInvitees.error)
      ? tableInviteeItems(
          tableInvitees.data?.pages.flatMap((page) => page.items) ?? [],
          intents,
          client
            .getQueriesData<InfiniteData<TableInviteesPageResponse>>({
              queryKey: [
                ...eventRecordKeys.root(options),
                "invitees",
                invitationTable.eventId,
                invitationTable.tableId,
              ],
            })
            .map(([key, data]) => ({ query: String(key[6]), pages: data?.pages ?? [] })),
          normalized,
        )
      : [];
  return {
    items: invitationTable
      ? tableItems
      : invitationGroupId
        ? (invitees.data?.pages
            .flatMap((page) => page.items)
            .filter((row) => !row.optimisticInvited && !excluded.has(row.id)) ?? [])
        : searching
          ? (search.data?.pages.flatMap((page) => page.users) ?? [])
          : friendsOnly
            ? (friends.data ?? []).flatMap((row) => (row.profile ? [row.profile] : []))
            : [],
    needsSearch,
    isPending: !needsSearch && source.isPending && !tableItems.length,
    isError: !needsSearch && source.isError,
    error: needsSearch ? null : source.error,
    hasNextPage: !needsSearch && Boolean(source.hasNextPage),
    isFetchingNextPage: !needsSearch && source.isFetchingNextPage,
    isFetchNextPageError: !needsSearch && source.isFetchNextPageError,
    fetchNextPage: () => source.fetchNextPage(),
    refetch: () => source.refetch(),
  };
}
