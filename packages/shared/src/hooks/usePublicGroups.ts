import type { CommunityPageResponse } from "@board-game-organizer/schemas";
import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import { type CommunityApiOptions, communityPagePath, communityRequest } from "../communityApi";
export type PublicGroup = { id: string; name: string; memberCount: number; createdAt: string };
export function publicGroupsQuery(options: CommunityApiOptions, query: string) {
  return infiniteQueryOptions({
    queryKey: ["groups", "discovery", options.apiUrl, options.userId, query],
    queryFn: ({ pageParam, signal }) =>
      communityRequest<CommunityPageResponse<PublicGroup>>(
        options,
        communityPagePath("groups/discovery", query, pageParam),
        "GET",
        undefined,
        signal,
      ),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled:
      options.enabled !== false &&
      Boolean(options.apiUrl && options.userId && query.trim().length >= 4),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
export function usePublicGroups(options: CommunityApiOptions, query: string) {
  const result = useInfiniteQuery(publicGroupsQuery(options, query));
  return { ...result, items: result.data?.pages.flatMap((page) => page.items) ?? [] };
}
