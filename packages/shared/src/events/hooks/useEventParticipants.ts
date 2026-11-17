"use client";
import type { EventParticipantsResponse } from "@board-game-organizer/schemas";
import { hashKey, infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import {
  type CommunityApiOptions,
  communityAccessDenied,
  communityRequest,
} from "../../community/communityApi";
import { reconcileProposalAccessError } from "../eventProposalCache";
import { eventRecordKeys } from "./useEventRecords";
import { useRecordListWindow } from "./useRecordListWindow";

type ParticipantView = { mode: "member" } | { mode: "review"; groupId: string | null };
export function eventParticipantsQuery(
  o: CommunityApiOptions,
  id: string,
  view: ParticipantView = { mode: "member" },
) {
  return infiniteQueryOptions({
    queryKey: [
      ...eventRecordKeys.root(o),
      "participants",
      id,
      "roles-v2",
      view.mode,
      view.mode === "review" ? view.groupId : null,
    ] as const,
    initialPageParam: "",
    queryFn: async ({ pageParam, signal, client, queryKey }) => {
      try {
        return await communityRequest<EventParticipantsResponse>(
          o,
          `events/${encodeURIComponent(id)}/participants?${new URLSearchParams({ limit: "20", view: view.mode, ...(pageParam ? { cursor: pageParam } : {}) })}`,
          "GET",
          undefined,
          signal,
        );
      } catch (error) {
        if (view.mode === "review")
          reconcileProposalAccessError(
            client,
            o,
            { eventId: id, groupId: view.groupId },
            error,
            queryKey,
          );
        throw error;
      }
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(o.apiUrl && o.userId && id && o.enabled !== false),
    retry: (count, error) => !communityAccessDenied(error) && count < 1,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
  });
}
export function useEventParticipants(o: CommunityApiOptions, id: string, view?: ParticipantView) {
  const options = eventParticipantsQuery(o, id, view);
  const q = useInfiniteQuery(options);
  const scope = hashKey(options.queryKey),
    current = useRef<string | null>(scope),
    scrolled = useRef<string | null>(null);
  current.current = scope;
  useEffect(() => {
    current.current = scope;
    return () => {
      if (current.current === scope) current.current = null;
      scrolled.current = null;
    };
  }, [scope]);
  const pages = communityAccessDenied(q.error) ? undefined : q.data?.pages;
  const window = useRecordListWindow({
    scope,
    pages,
    hasNextPage: q.hasNextPage,
    isFetching: q.isFetching || q.isError,
    fetchNextPage: () => q.fetchNextPage({ cancelRefetch: false }),
  });
  const loadMore = useCallback(() => {
    void window.fetchNextPage();
  }, [window.fetchNextPage]);
  const beginScroll = useCallback(() => {
    if (current.current === scope) scrolled.current = scope;
  }, [scope]);
  const endReached = useCallback(() => {
    if (scrolled.current === scope) loadMore();
  }, [scope, loadMore]);
  return {
    ...q,
    items: window.items,
    loadMore,
    beginScroll,
    endReached,
    hasMore: window.hasNextPage,
    cachedMore: window.cachedMore,
  };
}
