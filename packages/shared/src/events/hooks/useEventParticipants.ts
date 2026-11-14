"use client";
import type { EventParticipantsResponse } from "@board-game-organizer/schemas";
import { hashKey, infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type CommunityApiOptions,
  communityAccessDenied,
  communityRequest,
} from "../../community/communityApi";
import { reconcileProposalAccessError } from "../eventProposalCache";
import { eventRecordKeys } from "./useEventRecords";

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
    };
  }, [scope]);
  const [window, setWindow] = useState({ scope, pages: 1 });
  if (window.scope !== scope) {
    scrolled.current = null;
    setWindow({ scope, pages: 1 });
  }
  const count = window.scope === scope ? window.pages : 1;
  const pages = communityAccessDenied(q.error) ? undefined : q.data?.pages;
  const items = useMemo(
    () => pages?.slice(0, count).flatMap((page) => page.items) ?? [],
    [pages, count],
  );
  const cachedMore = (pages?.length ?? 0) > count;
  const loadMore = useCallback(() => {
    if (current.current !== scope || (!cachedMore && (!q.hasNextPage || q.isFetching || q.isError)))
      return;
    setWindow((old) =>
      old.scope === scope && old.pages < count + 1 ? { scope, pages: count + 1 } : old,
    );
    if (!cachedMore) void q.fetchNextPage({ cancelRefetch: false });
  }, [scope, cachedMore, count, q.hasNextPage, q.isFetching, q.isError, q.fetchNextPage]);
  const beginScroll = useCallback(() => {
    if (current.current === scope) scrolled.current = scope;
  }, [scope]);
  const endReached = useCallback(() => {
    if (scrolled.current === scope) loadMore();
  }, [scope, loadMore]);
  return {
    ...q,
    items,
    loadMore,
    beginScroll,
    endReached,
    hasMore: cachedMore || q.hasNextPage,
    cachedMore,
  };
}
