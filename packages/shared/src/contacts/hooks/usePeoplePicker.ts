"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { type CommunityApiOptions, communityRequest } from "../../community/communityApi";
import { type ContactUser, useRelationshipList } from "./useContacts";
/** Paged identity selection; local search text remains in each platform's UI. */
export function usePeoplePicker(options: CommunityApiOptions, query: string, friendsOnly: boolean) {
  const searching = query.trim().length >= 4,
    normalized = searching ? query.trim() : "";
  const friends = useRelationshipList(
    options.apiUrl,
    null,
    options.getToken,
    options.protectionBypass,
    options.userId,
    "friends",
    options.enabled !== false && friendsOnly && !searching,
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
    enabled: Boolean(options.userId && options.apiUrl && options.enabled !== false && searching),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
  });
  const source = searching ? search : friends;
  const needsSearch = !friendsOnly && !searching;
  return {
    items: searching
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
