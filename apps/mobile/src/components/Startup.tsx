import { getMobileNumber } from "@board-game-organizer/schemas";
import {
  fetchRelationshipsWithToken,
  groupsPageQuery,
  listRoles,
  matchesPageQuery,
  notificationsPageQuery,
  resolveApiUrl,
} from "@board-game-organizer/shared";
import { useAuth, useUser } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { hideStartupSplash } from "@/lib/splash";
import {
  isStartupAuthPending,
  isStartupDestinationSettled,
  remainingSplashMs,
} from "@/lib/startup";
import { useSessionAuth } from "@/lib/useSessionAuth";

const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
const initialFilters = { query: "", roles: listRoles, limit: 20 };

export function Startup({
  startedAt,
  initialNotificationHref,
}: {
  startedAt: number;
  initialNotificationHref: string | null | undefined;
}) {
  const {
    isLoaded: isAuthLoaded,
    isSignedIn: isRestoredSignedIn,
    sessionId,
  } = useAuth({
    treatPendingAsSignedOut: false,
  });
  const { getToken, isSignedIn, userId } = useSessionAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const previousSession = useRef<string | null>(null);
  const warmedSession = useRef<string | null>(null);
  const eligible =
    isAuthLoaded &&
    isRestoredSignedIn &&
    isSignedIn &&
    isUserLoaded &&
    Boolean(userId) &&
    Boolean(getMobileNumber(user?.unsafeMetadata));
  const destination = (initialNotificationHref ?? pathname).split("?")[0];
  const canWarm = ready && eligible && (initialNotificationHref !== undefined || timedOut);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        setTimedOut(true);
        setReady(true);
      },
      remainingSplashMs(startedAt, Date.now()),
    );
    return () => clearTimeout(timer);
  }, [startedAt]);

  useEffect(() => {
    if (!isAuthLoaded) return;
    if (previousSession.current && previousSession.current !== sessionId) queryClient.clear();
    previousSession.current = sessionId ?? null;
  }, [isAuthLoaded, sessionId, queryClient]);

  useEffect(() => {
    if (ready || isStartupAuthPending(isAuthLoaded, isRestoredSignedIn, isSignedIn, isUserLoaded))
      return;
    if (!eligible) {
      setReady(true); // Sign-in and required mobile-number step do not wait for network lists.
      return;
    }
    if (initialNotificationHref === undefined || !userId) return;
    const check = () => {
      // A push notification may still be redirecting from /matches to its destination.
      if (initialNotificationHref && pathname !== destination) return;
      if (isStartupDestinationSettled(queryClient, destination, apiUrl, userId)) setReady(true);
    };
    check();
    return queryClient.getQueryCache().subscribe(check);
  }, [
    ready,
    isAuthLoaded,
    isRestoredSignedIn,
    isSignedIn,
    isUserLoaded,
    eligible,
    initialNotificationHref,
    pathname,
    destination,
    userId,
    queryClient,
  ]);

  useEffect(() => {
    if (ready) hideStartupSplash();
  }, [ready]);

  useEffect(() => {
    if (!canWarm || !userId || !sessionId) return;
    if (warmedSession.current === sessionId) return;
    warmedSession.current = sessionId;
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      const options = { apiUrl, token, getToken, listFilters: initialFilters };
      const tasks = [
        () => queryClient.prefetchInfiniteQuery(matchesPageQuery(options)),
        () => queryClient.prefetchInfiniteQuery(groupsPageQuery(options)),
        () =>
          queryClient.prefetchInfiniteQuery(
            notificationsPageQuery({ apiUrl, getToken, userId, enabled: true }, 3),
          ),
        ...(["friends", "pending"] as const).map(
          (type) => () =>
            queryClient.prefetchQuery({
              queryKey: ["contacts", type, apiUrl, token],
              queryFn: () => fetchRelationshipsWithToken(apiUrl, token, getToken, type),
              staleTime: 30_000,
            }),
        ),
      ];
      let next = 0;
      const worker = async () => {
        while (!cancelled && next < tasks.length) {
          const task = tasks[next++];
          await task(); // prefetch never turns a failed request into cached empty data.
        }
      };
      await Promise.all([worker(), worker()]);
    })().catch(() => {
      /* Unavailable token/network: mounted screens retain their error UI. */
    });
    return () => {
      cancelled = true;
    };
  }, [canWarm, userId, sessionId, getToken, queryClient]);

  return null;
}
