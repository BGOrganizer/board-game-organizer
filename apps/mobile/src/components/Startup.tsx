import { getMobileNumber } from "@board-game-organizer/schemas";
import {
  fetchRelationshipsWithToken,
  fetchSuggestionsWithToken,
  groupsPageQuery,
  listRoles,
  matchesPageQuery,
  notificationsPageQuery,
  profileQueryOptions,
  resolveApiUrl,
} from "@board-game-organizer/shared";
import { useAuth, useUser } from "@clerk/expo";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AnimatedStartupSplash } from "@/components/AnimatedStartupSplash";
import { NotificationBadgeSync } from "@/components/NotificationBadgeSync";
import { warmRegisteredContacts } from "@/lib/registeredContacts";
import { hideStartupSplash } from "@/lib/splash";
import {
  isStartupAuthPending,
  isStartupDestinationSettled,
  remainingSplashMs,
  startupRelationshipTypes,
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
  const [ready, setReady] = useState(() => remainingSplashMs(startedAt, Date.now()) === 0);
  const [timedOut, setTimedOut] = useState(ready);
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
    let active = true;
    const check = () => {
      if (!active) return;
      // A push notification may still be redirecting from /matches to its destination.
      if (initialNotificationHref && pathname !== destination) return;
      if (isStartupDestinationSettled(queryClient, destination, apiUrl, userId)) setReady(true);
    };
    check();
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      // Query observers may notify while another component renders.
      queueMicrotask(check);
    });
    return () => {
      active = false;
      unsubscribe();
    };
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
        () => queryClient.prefetchQuery(profileQueryOptions({ apiUrl, getToken, userId })),
        async () => {
          try {
            const synced = await warmRegisteredContacts(userId, apiUrl, getToken, () => !cancelled);
            if (synced && !cancelled)
              await queryClient.invalidateQueries({
                queryKey: ["contacts", "suggestions"],
                refetchType: "all",
              });
          } catch (error) {
            Sentry.captureException(error, { tags: { operation: "contacts.startup-sync" } });
            // Contacts tab retains its observable sync error and retry path.
          }
        },
        () =>
          queryClient.prefetchQuery({
            queryKey: ["contacts", "suggestions", apiUrl, token],
            queryFn: () => fetchSuggestionsWithToken(apiUrl, token, getToken),
            staleTime: 60_000,
          }),
        () => queryClient.prefetchInfiniteQuery(matchesPageQuery(options)),
        () => queryClient.prefetchInfiniteQuery(groupsPageQuery(options)),
        () =>
          queryClient.prefetchInfiniteQuery(
            notificationsPageQuery({ apiUrl, getToken, userId, enabled: true }, 3),
          ),
        ...startupRelationshipTypes.map(
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

  return ready ? <NotificationBadgeSync /> : <AnimatedStartupSplash startedAt={startedAt} />;
}
