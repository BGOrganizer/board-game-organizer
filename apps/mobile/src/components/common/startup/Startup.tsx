import { getMobileNumber } from "@board-game-organizer/schemas";
import {
  resolveApiUrl,
  warmStartupBackground,
  warmStartupPriority,
} from "@board-game-organizer/shared";
import { useAuth, useUser } from "@clerk/expo";
import { useLingui } from "@lingui/react";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Contacts from "expo-contacts";
import { usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { AnimatedStartupSplash } from "@/components/common/startup/AnimatedStartupSplash";
import { NotificationBadgeSync } from "@/components/notifications/NotificationBadgeSync";
import { warmRegisteredContacts } from "@/lib/contacts/registeredContacts";
import { hideStartupSplash } from "@/lib/splash";
import {
  isStartupAuthPending,
  isStartupDestinationSettled,
  isStartupEssentialsSettled,
  remainingSplashMs,
  startupLinkPath,
} from "@/lib/startup";
import { useSessionAuth } from "@/lib/useSessionAuth";

const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);

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
  } = useAuth({ treatPendingAsSignedOut: false });
  const { getToken, isSignedIn, userId } = useSessionAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const { i18n } = useLingui();
  const locale = i18n.locale.startsWith("it") ? "it" : "en";
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [ready, setReady] = useState(() => remainingSplashMs(startedAt, Date.now()) === 0);
  const [initialLink, setInitialLink] = useState<string | null | undefined>();
  const previousSession = useRef<string | null>(null);
  const warmedSession = useRef<string | null>(null);
  const backgroundSession = useRef<string | null>(null);
  const syncedSession = useRef<string | null>(null);
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
    const timer = setTimeout(() => setReady(true), remainingSplashMs(startedAt, Date.now()));
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
      setReady(true); // Sign-in/onboarding never waits for list requests.
      return;
    }
    if (initialNotificationHref === undefined || initialLink === undefined || !userId) return;
    let active = true;
    const check = () => {
      if (!active) return;
      if (!deepLink) {
        if (pathname !== "/" && isStartupEssentialsSettled(queryClient, apiUrl, userId))
          setReady(true);
        return;
      }
      if ((initialNotificationHref || linkPath) && pathname !== destination) return;
      if (isStartupDestinationSettled(queryClient, destination, apiUrl, userId, locale))
        setReady(true);
    };
    check();
    const unsubscribe = queryClient.getQueryCache().subscribe(() => queueMicrotask(check));
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
    locale,
  ]);

  useEffect(() => {
    if (ready) hideStartupSplash();
  }, [ready]);

  useEffect(() => {
    if (!canWarm || !userId || !sessionId || warmedSession.current === sessionId) return;
    warmedSession.current = sessionId;
    let active = true;
    let completed = false;
    void warmStartupPriority(queryClient, { apiUrl, getToken, userId }, () => active).finally(
      () => {
        completed = true;
      },
    );
    return () => {
      active = false;
      if (!completed) warmedSession.current = null;
    };
  }, [canWarm, userId, sessionId, getToken, queryClient]);

  useEffect(() => {
    if (!ready || !eligible || !userId || !sessionId) return;
    const owner = JSON.stringify([sessionId, locale]);
    if (backgroundSession.current === owner) return;
    backgroundSession.current = owner;
    let active = true;
    let completed = false;
    void warmStartupBackground(
      queryClient,
      { apiUrl, getToken, userId, locale },
      () => active,
    ).finally(() => {
      completed = true;
    });
    // Local permissions/contacts stay platform-owned; never prompt at startup.
    void (async () => {
      try {
        const permission = await Contacts.getPermissionsAsync();
        if (active && permission.granted)
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
      }
    })();
    return () => {
      active = false;
      if (!completed) backgroundSession.current = null;
    };
  }, [ready, eligible, userId, sessionId, locale, getToken, queryClient]);

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

  return ready ? <NotificationBadgeSync /> : <AnimatedStartupSplash startedAt={startedAt} />;
}
