import { getMobileNumber } from "@board-game-organizer/schemas";
import {
  fetchRelationshipPageWithToken,
  fetchSuggestionPageWithToken,
  groupsPageQuery,
  listRoles,
  matchDetailQuery,
  matchesPageQuery,
  notificationsPageQuery,
  profileQueryOptions,
  resolveApiUrl,
} from "@board-game-organizer/shared";
import { useAuth, useUser } from "@clerk/expo";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Contacts from "expo-contacts";
import { usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { AnimatedStartupSplash } from "@/components/AnimatedStartupSplash";
import { NotificationBadgeSync } from "@/components/NotificationBadgeSync";
import { warmRegisteredContacts } from "@/lib/registeredContacts";
import { hideStartupSplash } from "@/lib/splash";
import {
  isStartupAuthPending,
  isStartupDestinationSettled,
  isStartupEssentialsSettled,
  remainingSplashMs,
  startupLinkPath,
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
  const [deviceContactsReady, setDeviceContactsReady] = useState(false);
  const [initialLink, setInitialLink] = useState<string | null | undefined>();
  const previousSession = useRef<string | null>(null);
  const warmedSession = useRef<string | null>(null);
  const syncedSession = useRef<string | null>(null);
  const prefetchedMatches = useRef(new Set<string>());
  const eligible =
    isAuthLoaded &&
    isRestoredSignedIn &&
    isSignedIn &&
    isUserLoaded &&
    Boolean(userId) &&
    Boolean(getMobileNumber(user?.unsafeMetadata));
  const linkPath = startupLinkPath(initialLink);
  const destination = (initialNotificationHref ?? linkPath ?? pathname).split("?")[0];
  const deepLink = Boolean(initialNotificationHref || initialLink?.startsWith("bgo:"));
  const canWarm =
    eligible &&
    initialNotificationHref !== undefined &&
    (initialLink !== undefined || ready) &&
    (!deepLink || ready);

  useEffect(() => {
    let active = true;
    void Linking.getInitialURL()
      .then((url) => {
        if (active) setInitialLink(url);
      })
      .catch(() => {
        if (active) setInitialLink(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        setReady(true);
      },
      remainingSplashMs(startedAt, Date.now()),
    );
    return () => clearTimeout(timer);
  }, [startedAt]);

  useEffect(() => {
    if (!isAuthLoaded) return;
    if (previousSession.current && previousSession.current !== sessionId) {
      queryClient.clear();
      prefetchedMatches.current.clear();
    }
    previousSession.current = sessionId ?? null;
  }, [isAuthLoaded, sessionId, queryClient]);

  useEffect(() => {
    if (ready || isStartupAuthPending(isAuthLoaded, isRestoredSignedIn, isSignedIn, isUserLoaded))
      return;
    if (!eligible) {
      setReady(true); // Sign-in and required mobile-number step do not wait for network lists.
      return;
    }
    if (initialNotificationHref === undefined || initialLink === undefined || !userId) return;
    let active = true;
    const check = () => {
      if (!active) return;
      // A push notification may still be redirecting from /matches to its destination.
      if (!deepLink) {
        if (
          pathname !== "/" &&
          deviceContactsReady &&
          isStartupEssentialsSettled(queryClient, apiUrl, userId)
        )
          setReady(true);
        return;
      }
      if ((initialNotificationHref || linkPath) && pathname !== destination) return;
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
    initialLink,
    linkPath,
    deepLink,
    pathname,
    destination,
    userId,
    queryClient,
    deviceContactsReady,
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
      const options = { apiUrl, token, getToken, userId, listFilters: initialFilters };
      const tasks = [
        async () => {
          try {
            const permission = await Contacts.getPermissionsAsync();
            if (permission.granted)
              await queryClient.prefetchQuery({
                queryKey: ["device-contacts", apiUrl, userId],
                queryFn: () =>
                  Contacts.Contact.getAllDetails(
                    [
                      Contacts.ContactField.FULL_NAME,
                      Contacts.ContactField.EMAILS,
                      Contacts.ContactField.PHONES,
                    ],
                    { limit: 40, offset: 0, sortOrder: Contacts.ContactsSortOrder.GivenName },
                  ),
                staleTime: 60_000,
              });
          } catch (error) {
            Sentry.captureException(error, { tags: { operation: "contacts.startup-page" } });
          } finally {
            if (!cancelled) setDeviceContactsReady(true);
          }
        },
        () => queryClient.prefetchQuery(profileQueryOptions({ apiUrl, getToken, userId })),
        () => queryClient.prefetchInfiniteQuery(matchesPageQuery(options)),
        () => queryClient.prefetchInfiniteQuery(groupsPageQuery(options)),
        ...startupRelationshipTypes.map(
          (type) => () =>
            queryClient.prefetchInfiniteQuery({
              queryKey: ["contacts", type, apiUrl, userId],
              queryFn: ({ pageParam }) =>
                fetchRelationshipPageWithToken(apiUrl, token, getToken, type, pageParam),
              initialPageParam: "",
              getNextPageParam: (page: { nextCursor: string | null }) =>
                page.nextCursor ?? undefined,
              staleTime: 5 * 60_000,
            }),
        ),
        () =>
          queryClient.prefetchInfiniteQuery({
            queryKey: ["contacts", "suggestions", apiUrl, userId],
            queryFn: ({ pageParam }) =>
              fetchSuggestionPageWithToken(apiUrl, token, getToken, pageParam),
            initialPageParam: "",
            getNextPageParam: (page: { nextCursor: string | null }) => page.nextCursor ?? undefined,
            staleTime: 5 * 60_000,
          }),
        () =>
          queryClient.prefetchInfiniteQuery(
            notificationsPageQuery({ apiUrl, getToken, userId, enabled: true }, 3),
          ),
      ];
      let next = 0;
      const worker = async () => {
        while (!cancelled && next < tasks.length) {
          const task = tasks[next++];
          await task(); // prefetch never turns a failed request into cached empty data.
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    })().catch(() => {
      /* Unavailable token/network: mounted screens retain their error UI. */
    });
    return () => {
      cancelled = true;
    };
  }, [canWarm, userId, sessionId, getToken, queryClient]);

  useEffect(() => {
    if (!ready || !eligible || !sessionId || !userId || syncedSession.current === sessionId) return;
    syncedSession.current = sessionId;
    let cancelled = false;
    void warmRegisteredContacts(userId, apiUrl, getToken, () => !cancelled)
      .then((synced) => {
        if (synced && !cancelled) {
          queryClient.setQueryData(["contact-sync", apiUrl, userId], synced);
          return queryClient.invalidateQueries({
            queryKey: ["contacts", "suggestions"],
            refetchType: "all",
          });
        }
      })
      .catch((error) => {
        Sentry.captureException(error, { tags: { operation: "contacts.startup-sync" } });
      });
    return () => {
      cancelled = true;
    };
  }, [ready, eligible, userId, sessionId, getToken, queryClient]);

  useEffect(() => {
    if (!ready || !eligible || !userId) return;
    let active = true;
    const prefetchVisible = () => {
      if (!active) return;
      const data = queryClient.getQueryData<{ pages: Array<{ matches: Array<{ id: string }> }> }>([
        "matches",
        "paged",
        apiUrl,
        userId,
        "",
        listRoles.join(","),
      ]);
      for (const match of data?.pages[0]?.matches.slice(0, 2) ?? []) {
        if (prefetchedMatches.current.has(match.id)) continue;
        prefetchedMatches.current.add(match.id);
        void queryClient.prefetchQuery(
          matchDetailQuery({ apiUrl, token: null, getToken, userId, matchId: match.id }),
        );
      }
    };
    prefetchVisible();
    const unsubscribe = queryClient
      .getQueryCache()
      .subscribe(() => queueMicrotask(prefetchVisible));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [ready, eligible, userId, getToken, queryClient]);

  return ready ? <NotificationBadgeSync /> : <AnimatedStartupSplash startedAt={startedAt} />;
}
