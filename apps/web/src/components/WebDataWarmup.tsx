"use client";

import {
  fetchRelationshipPageWithToken,
  fetchSuggestionPageWithToken,
  groupsPageQuery,
  listRoles,
  matchDetailQuery,
  matchesPageQuery,
  profileQueryOptions,
  resolveApiUrl,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

const listFilters = { query: "", roles: listRoles, limit: 20 };
const socialTypes = ["friends", "pending", "following", "followers", "sent", "blocked"] as const;

/** Warm the same first-page keys used by the tabs. No polling or extra navigation delay. */
export function WebDataWarmup() {
  const { getToken, isLoaded, userId, sessionId } = useAuth();
  const client = useQueryClient();
  const previous = useRef<string | null>(null);
  const warmed = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (previous.current && previous.current !== sessionId) client.clear();
    previous.current = sessionId ?? null;
  }, [client, isLoaded, sessionId]);

  useEffect(() => {
    if (!isLoaded || !userId || !sessionId || warmed.current === sessionId) return;
    warmed.current = sessionId;
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      const apiUrl = resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
      const protectionBypass = process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
      const options = { apiUrl, token, getToken, userId, protectionBypass, listFilters };
      const tasks = [
        () =>
          client.prefetchQuery(profileQueryOptions({ apiUrl, getToken, userId, protectionBypass })),
        () => client.prefetchInfiniteQuery(matchesPageQuery(options)),
        () => client.prefetchInfiniteQuery(groupsPageQuery(options)),
        ...socialTypes.map(
          (type) => () =>
            client.prefetchInfiniteQuery({
              queryKey: ["contacts", type, apiUrl, userId],
              queryFn: ({ pageParam }) =>
                fetchRelationshipPageWithToken(
                  apiUrl,
                  token,
                  getToken,
                  type,
                  pageParam,
                  protectionBypass,
                ),
              initialPageParam: "",
              getNextPageParam: (page: { nextCursor: string | null }) =>
                page.nextCursor ?? undefined,
              staleTime: 5 * 60_000,
            }),
        ),
        () =>
          client.prefetchInfiniteQuery({
            queryKey: ["contacts", "suggestions", apiUrl, userId],
            queryFn: ({ pageParam }) =>
              fetchSuggestionPageWithToken(apiUrl, token, getToken, pageParam, protectionBypass),
            initialPageParam: "",
            getNextPageParam: (page: { nextCursor: string | null }) => page.nextCursor ?? undefined,
            staleTime: 5 * 60_000,
          }),
      ];
      let next = 0;
      const worker = async () => {
        while (!cancelled && next < tasks.length) await tasks[next++]();
      };
      await Promise.all([worker(), worker(), worker()]);
      if (cancelled) return;
      const firstPage = client.getQueryData<{ pages: Array<{ matches: Array<{ id: string }> }> }>([
        "matches",
        "paged",
        apiUrl,
        userId,
        "",
        listRoles.join(","),
      ]);
      await Promise.all(
        (firstPage?.pages[0]?.matches.slice(0, 2) ?? []).map((match) =>
          client.prefetchQuery(matchDetailQuery({ ...options, matchId: match.id })),
        ),
      );
    })().catch(() => {}); // Each page retains its observable error and retry state.
    return () => {
      cancelled = true;
    };
  }, [client, getToken, isLoaded, sessionId, userId]);

  return null;
}
