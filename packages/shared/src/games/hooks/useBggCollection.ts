"use client";

import type { BggCollectionResponse } from "@board-game-organizer/schemas";
import { infiniteQueryOptions, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { CommunityApiError, communityRequest } from "../../community/communityApi";
import { profileViewKeys, useProfileReadGuard } from "../../profile/hooks/useProfileView";

export function bggCollectionQuery(options: {
  apiUrl: string;
  userId?: string | null;
  getToken: () => Promise<string | null>;
  protectionBypass?: string | null;
  snapshot?: string | null;
  query: string;
  subjectId?: string;
  types?: "all" | "games" | "expansions" | "none";
  wishlist?: boolean;
  commonSnapshot?: string;
}) {
  const query = options.query.trim();
  return infiniteQueryOptions({
    queryKey: [
      "bgg-collection",
      options.apiUrl,
      options.userId,
      options.snapshot,
      query,
      options.subjectId ?? options.userId,
      options.types ?? "all",
      options.wishlist ?? false,
      options.commonSnapshot ?? null,
    ] as const,
    enabled: Boolean(options.userId && options.snapshot),
    staleTime: 5 * 60_000,
    retry: (count, error) =>
      !(
        error instanceof CommunityApiError && [400, 401, 403, 404, 409, 422].includes(error.status)
      ) && count < 2,
    initialPageParam: "",
    queryFn: async ({ pageParam, signal }): Promise<BggCollectionResponse> => {
      const params = new URLSearchParams({
        ...(options.subjectId && options.subjectId !== options.userId
          ? { subjectId: options.subjectId }
          : {}),
        ...(options.types ? { types: options.types } : {}),
        ...(options.wishlist ? { wishlist: "true" } : {}),
        ...(options.commonSnapshot ? { commonSnapshot: options.commonSnapshot } : {}),
        snapshot: options.snapshot ?? "",
        query,
        ...(pageParam ? { cursor: pageParam } : {}),
      });
      const data = await communityRequest<BggCollectionResponse>(
        { ...options, userId: options.userId },
        `bgg/collection?${params}`,
        "GET",
        undefined,
        signal,
      );
      if (signal.aborted) throw new Error("MUTATION_OWNER_CHANGED");
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
  useProfileReadGuard(
    { ...options, userId: options.userId },
    options.subjectId ?? options.userId ?? "",
    {
      error:
        result.error instanceof CommunityApiError &&
        (result.error.code === "PROFILE_NOT_FOUND" || [401, 403].includes(result.error.status))
          ? result.error
          : null,
      isFetching: result.isFetching,
      isEnabled: result.isEnabled,
    },
  );
  useEffect(() => {
    if (result.error instanceof CommunityApiError && [404, 409].includes(result.error.status)) {
      void client.invalidateQueries({ queryKey: ["bgg-account", options.apiUrl, options.userId] });
      void client.invalidateQueries({
        queryKey: profileViewKeys.view(
          { ...options, userId: options.userId },
          options.subjectId ?? options.userId ?? "",
        ),
      });
    }
  }, [client, result.error, options.apiUrl, options.userId, options.subjectId]);
  return result;
}
