"use client";

import type { BggCollectionResponse } from "@board-game-organizer/schemas";
import { infiniteQueryOptions, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiHeaders, withProtectionBypass } from "../../common/api";
import { CommunityApiError } from "../../community/communityApi";

export function bggCollectionQuery(options: {
  apiUrl: string;
  userId?: string | null;
  getToken: () => Promise<string | null>;
  protectionBypass?: string | null;
  snapshot?: string | null;
  query: string;
}) {
  const query = options.query.trim();
  return infiniteQueryOptions({
    queryKey: ["bgg-collection", options.apiUrl, options.userId, options.snapshot, query] as const,
    enabled: Boolean(options.userId && options.snapshot),
    staleTime: 5 * 60_000,
    retry: (count, error) =>
      !(
        error instanceof CommunityApiError && [400, 401, 403, 404, 409, 422].includes(error.status)
      ) && count < 2,
    initialPageParam: "",
    queryFn: async ({ pageParam, signal }): Promise<BggCollectionResponse> => {
      const token = await options.getToken();
      if (!token) throw new CommunityApiError(401, "No session token");
      if (signal.aborted) throw new Error("MUTATION_OWNER_CHANGED");
      const params = new URLSearchParams({
        snapshot: options.snapshot ?? "",
        query,
        ...(pageParam ? { cursor: pageParam } : {}),
      });
      const response = await fetch(
        withProtectionBypass(
          `${options.apiUrl}/api/bgg/collection?${params}`,
          options.protectionBypass,
        ),
        { headers: apiHeaders(token), signal },
      );
      if (!response.ok)
        throw new CommunityApiError(
          response.status,
          response.status === 409 ? "BGG_COLLECTION_CHANGED" : "BGG_COLLECTION_UNAVAILABLE",
        );
      const data = (await response.json()) as BggCollectionResponse;
      if (data.snapshot !== options.snapshot)
        throw new CommunityApiError(409, "BGG_COLLECTION_CHANGED");
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useBggCollection(options: Parameters<typeof bggCollectionQuery>[0]) {
  const client = useQueryClient();
  const result = useInfiniteQuery(bggCollectionQuery(options));
  useEffect(() => {
    if (result.error instanceof CommunityApiError && [404, 409].includes(result.error.status)) {
      void client.invalidateQueries({ queryKey: ["bgg-account", options.apiUrl, options.userId] });
    }
  }, [client, result.error, options.apiUrl, options.userId]);
  return result;
}
