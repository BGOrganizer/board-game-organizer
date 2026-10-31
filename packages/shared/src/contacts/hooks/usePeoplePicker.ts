"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useScopedMutations } from "../../common/hooks/useScopedMutations";
import { type CommunityApiOptions, communityRequest } from "../../community/communityApi";
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
  const pendingInvites = useScopedMutations({
    mutationKey: invitationTable
      ? eventRecordKeys.mutation(options, invitationTable.eventId, "invite")
      : [...groupRecordKeys.root(options), "mutation"],
    status: "pending",
  });
  const excluded = new Set(
    pendingInvites.flatMap((mutation) => {
      if (mutation.options.mutationKey?.at(-1) !== "invite") return [];
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
  return {
    items: invitationTable
      ? (tableInvitees.data?.pages
          .flatMap((page) => page.items)
          .filter((row) => !row.optimisticInvited && !excluded.has(row.id)) ?? [])
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
    isPending: !needsSearch && source.isPending,
    isError: !needsSearch && source.isError,
    error: needsSearch ? null : source.error,
    hasNextPage: !needsSearch && Boolean(source.hasNextPage),
    isFetchingNextPage: !needsSearch && source.isFetchingNextPage,
    isFetchNextPageError: !needsSearch && source.isFetchNextPageError,
    fetchNextPage: () => source.fetchNextPage(),
    refetch: () => source.refetch(),
  };
}
