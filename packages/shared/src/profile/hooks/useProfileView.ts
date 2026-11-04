"use client";

import type {
  CommunityActivityPage,
  CommunityNetwork,
  ProfileActivityKind,
  ProfileActivityPage,
  ProfileRatingGames,
  ProfileRatingHistory,
  ProfileView,
} from "@board-game-organizer/schemas";
import {
  infiniteQueryOptions,
  notifyManager,
  type QueryKey,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { updateOptimisticBase } from "../../common/optimisticOperation";
import {
  CommunityApiError,
  type CommunityApiOptions,
  communityAccessDenied,
  communityRequest,
} from "../../community/communityApi";
import { ACTIVITY_FEED_POLICY, activityVisibilityVerified } from "../activityFeed";

function verifiedActivityPage<T extends ProfileActivityPage>(page: T): T {
  if (!activityVisibilityVerified(page))
    throw new CommunityApiError(502, "ACTIVITY_VISIBILITY_UNVERIFIED");
  return page;
}

/** A denied child read revokes this subject's cached profile, never another API/viewer/subject. */
function useProfileReadGuard<T extends { error: unknown; isFetching: boolean; isEnabled: boolean }>(
  o: CommunityApiOptions,
  subject: string,
  result: T,
): T {
  const client = useQueryClient();
  useEffect(() => {
    if (!result.isEnabled || result.isFetching || !communityAccessDenied(result.error)) return;
    const filters = {
      predicate: ({ queryKey: key }: { queryKey: QueryKey }) =>
        key[0] === "profile" &&
        key[1] === o.apiUrl &&
        key[2] === o.userId &&
        (key.length === 3 ? subject === o.userId : key[4] === subject),
    };
    const queries = client.getQueryCache().findAll(filters);
    if (queries.every((query) => query.state.data === null && query.state.error === result.error))
      return;
    void client.cancelQueries(filters, { revert: false });
    notifyManager.batch(() => {
      for (const query of queries) {
        updateOptimisticBase(client, query.queryKey, () => null);
        query.setState({
          data: null,
          dataUpdatedAt: 0,
          error: result.error as Error,
          errorUpdatedAt: Date.now(),
          status: "error",
          isInvalidated: true,
        });
      }
    });
  }, [client, o.apiUrl, o.userId, subject, result.error, result.isFetching, result.isEnabled]);
  return result;
}
export const profileViewKeys = {
  root: (o: CommunityApiOptions) => ["profile", o.apiUrl, o.userId] as const,
  view: (o: CommunityApiOptions, subject: string) =>
    [...profileViewKeys.root(o), "view", subject] as const,
};
export function profileViewQuery(o: CommunityApiOptions, subject: string) {
  return queryOptions({
    queryKey: profileViewKeys.view(o, subject),
    queryFn: ({ signal }) =>
      communityRequest<ProfileView>(
        o,
        `profiles/${encodeURIComponent(subject)}`,
        "GET",
        undefined,
        signal,
      ),
    staleTime: 60_000,
  });
}
export function useProfileView(o: CommunityApiOptions, subject: string) {
  const client = useQueryClient(),
    root = profileViewKeys.root(o),
    seed = subject === o.userId ? client.getQueryData<ProfileView>(root) : undefined;
  const query = useQuery({
    ...profileViewQuery(o, subject),
    initialData: seed?.id === subject && seed.social && seed.player ? seed : undefined,
    initialDataUpdatedAt: seed
      ? client.getQueryState(root)?.isInvalidated
        ? 0
        : client.getQueryState(root)?.dataUpdatedAt
      : undefined,
    enabled: o.enabled !== false && Boolean(o.userId && subject),
  });
  return useProfileReadGuard(o, subject, query);
}
export function profileActivitiesQuery(
  o: CommunityApiOptions,
  subject: string,
  kind: ProfileActivityKind | undefined,
  limit: 5 | 10,
) {
  return infiniteQueryOptions({
    queryKey: [
      ...profileViewKeys.root(o),
      "activities",
      subject,
      kind ?? null,
      limit,
      ACTIVITY_FEED_POLICY,
    ] as const,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        limit: String(limit),
        ...(kind ? { kind } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      });
      return communityRequest<ProfileActivityPage>(
        o,
        `profiles/${encodeURIComponent(subject)}/activities?${params}`,
        "GET",
        undefined,
        signal,
      ).then(verifiedActivityPage);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  });
}
export function useProfileActivities(
  o: CommunityApiOptions,
  subject: string,
  kind?: ProfileActivityKind,
  limit: 5 | 10 = 5,
) {
  const query = useInfiniteQuery({
    ...profileActivitiesQuery(o, subject, kind, limit),
    enabled: o.enabled !== false && Boolean(o.userId && subject),
  });
  return useProfileReadGuard(o, subject, query);
}
export function communityActivitiesQuery(o: CommunityApiOptions, network: CommunityNetwork) {
  return infiniteQueryOptions({
    queryKey: [...profileViewKeys.root(o), "network", network, ACTIVITY_FEED_POLICY] as const,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      communityRequest<CommunityActivityPage>(
        o,
        `community/activities?${new URLSearchParams({ network, limit: "10", ...(pageParam ? { cursor: pageParam } : {}) })}`,
        "GET",
        undefined,
        signal,
      ).then(verifiedActivityPage),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  });
}
export function useCommunityActivities(o: CommunityApiOptions, network: CommunityNetwork) {
  return useInfiniteQuery({
    ...communityActivitiesQuery(o, network),
    enabled: o.enabled !== false && Boolean(o.userId),
  });
}
export function useProfileRatingGames(o: CommunityApiOptions, subject: string, query: string) {
  const result = useInfiniteQuery({
    queryKey: [...profileViewKeys.root(o), "games", subject, query] as const,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      communityRequest<ProfileRatingGames>(
        o,
        `profiles/${encodeURIComponent(subject)}/games?${new URLSearchParams({ cursor: String(pageParam), query })}`,
        "GET",
        undefined,
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: o.enabled !== false && Boolean(o.userId && subject),
    staleTime: 60_000,
  });
  return useProfileReadGuard(o, subject, result);
}
export function useProfileRating(o: CommunityApiOptions, subject: string, gameId: number | null) {
  const query = useInfiniteQuery({
    queryKey: [...profileViewKeys.root(o), "rating", subject, gameId] as const,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) =>
      communityRequest<ProfileRatingHistory>(
        o,
        `profiles/${encodeURIComponent(subject)}/games/${gameId}${pageParam ? `?cursor=${pageParam}` : ""}`,
        "GET",
        undefined,
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: o.enabled !== false && Boolean(o.userId && subject && gameId),
    staleTime: 60_000,
  });
  return useProfileReadGuard(o, subject, query);
}
