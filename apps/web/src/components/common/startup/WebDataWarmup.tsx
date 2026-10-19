"use client";
import {
  eventRecordQuery,
  eventRecordsQuery,
  fetchRelationshipPageWithToken,
  fetchSuggestionPageWithToken,
  groupRecordsPageQuery,
  profileQueryOptions,
  recordTablesQuery,
  resolveApiUrl,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const socialTypes = ["friends", "pending", "following", "followers", "sent", "blocked"] as const;
/** First pages only. A cold deep link gets the connection budget before background warmup. */
export function WebDataWarmup() {
  const { getToken, isLoaded, userId, sessionId } = useAuth(),
    client = useQueryClient(),
    pathname = usePathname(),
    warmed = useRef<string | null>(null),
    previous = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded) return;
    const identity = userId && sessionId ? `${userId}/${sessionId}` : null;
    if (previous.current && previous.current !== identity) client.clear();
    previous.current = identity;
    if (!userId || !identity || warmed.current === identity) return;
    let cancelled = false;
    const start = async () => {
      if (cancelled) return;
      warmed.current = identity;
      const options = {
        apiUrl: resolveApiUrl(process.env.NEXT_PUBLIC_API_URL),
        getToken,
        userId,
        protectionBypass: process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS,
      };
      const tasks = [
        () => client.prefetchQuery(profileQueryOptions(options)),
        () => client.prefetchInfiniteQuery(recordTablesQuery(options, null)),
        () => client.prefetchInfiniteQuery(groupRecordsPageQuery(options)),
        () => client.prefetchInfiniteQuery(eventRecordsQuery(options)),
        ...socialTypes.map(
          (type) => () =>
            client.prefetchInfiniteQuery({
              queryKey: ["contacts", type, options.apiUrl, userId],
              queryFn: ({ pageParam }) =>
                fetchRelationshipPageWithToken(
                  options.apiUrl,
                  null,
                  getToken,
                  type,
                  pageParam,
                  options.protectionBypass,
                ),
              initialPageParam: "",
              getNextPageParam: (
                page: Awaited<ReturnType<typeof fetchRelationshipPageWithToken>>,
              ) => page.nextCursor ?? undefined,
              staleTime: 5 * 60_000,
            }),
        ),
        () =>
          client.prefetchInfiniteQuery({
            queryKey: ["contacts", "suggestions", options.apiUrl, userId],
            queryFn: ({ pageParam }) =>
              fetchSuggestionPageWithToken(
                options.apiUrl,
                null,
                getToken,
                pageParam,
                options.protectionBypass,
              ),
            initialPageParam: "",
            getNextPageParam: (page: Awaited<ReturnType<typeof fetchSuggestionPageWithToken>>) =>
              page.nextCursor ?? undefined,
            staleTime: 5 * 60_000,
          }),
      ];
      let next = 0;
      const worker = async () => {
        while (!cancelled && next < tasks.length) await tasks[next++]();
      };
      await Promise.all([worker(), worker(), worker()]);
      if (!cancelled) {
        const list = client.getQueryData(recordTablesQuery(options, null).queryKey);
        const ids = [...new Set(list?.pages[0]?.items.map((row) => row.eventId) ?? [])].slice(0, 2);
        await Promise.all(ids.map((id) => client.prefetchQuery(eventRecordQuery(options, id))));
      }
    };
    const timer = setTimeout(
      () => void start(),
      /^\/(events|groups)\/[^/]+/.test(pathname) ? 5000 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, getToken, isLoaded, userId, sessionId, pathname]);
  return null;
}
