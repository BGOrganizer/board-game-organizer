import { createQueryClient } from "@board-game-organizer/query";
import { clearSessionQueryCache, resolveApiUrl } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { useAuth } from "@clerk/expo";
import * as Sentry from "@sentry/react-native";
import { IsRestoringProvider, QueryClientProvider } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Typography } from "heroui-native/text";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { MobileCacheContext } from "@/lib/cache/mobileCacheContext";
import { openMobileQueryStorage, purgeMobileQueryStorage } from "@/lib/cache/mobileQueryStorage";
import {
  configureMobileCache,
  createSessionPersister,
  ownsPersistedQuery,
  restoreSessionCache,
} from "@/lib/cache/queryPersistence";
import { useT } from "@/lib/i18n";
import { remainingSplashMs } from "@/lib/startup";

const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
export function MobileQueryProvider({
  children,
  startedAt,
}: {
  children: ReactNode;
  startedAt: number;
}) {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth({ treatPendingAsSignedOut: false });
  const { isSignedIn: isActiveSession } = useAuth();
  const [client] = useState(createQueryClient);
  const [restored, setRestored] = useState<string>();
  const [blocked, setBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const t = useT();
  const generation = useRef(0);
  const reported = useRef(false);
  const previous = useRef<string | undefined>(undefined);
  const current = useRef<{ stop(): void; flush(): void } | undefined>(undefined);
  const identity =
    isLoaded && isSignedIn === false
      ? "signed-out"
      : isLoaded && isSignedIn && isActiveSession && userId && sessionId
        ? JSON.stringify([apiUrl, userId, sessionId])
        : undefined;
  const restoring = blocked || identity === undefined || restored !== identity;
  const report = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    setFailed(true);
    // Never send storage payloads, user identifiers or native exception messages to telemetry.
    Sentry.captureException(new Error("Mobile query storage unavailable"), {
      tags: { operation: "cache.persistence" },
    });
  }, []);

  useEffect(
    () => configureMobileCache(client, userId ? { apiUrl, userId } : undefined),
    [client, userId],
  );
  useEffect(() => {
    if (!identity || blocked) return;
    const ticket = ++generation.current;
    const isCurrent = () => generation.current === ticket;
    current.current?.stop();
    current.current = undefined;
    const ownerChanged = Boolean(previous.current && previous.current !== identity);
    if (ownerChanged) {
      clearSessionQueryCache(client);
      useAppStore.getState().clearPending();
    }
    previous.current = identity;
    let unsubscribe = () => {};
    const removed = new Set<string>();
    const stopTracking = client.getQueryCache().subscribe((event) => {
      if (event.type === "removed") removed.add(event.query.queryHash);
    });
    const timer = setTimeout(
      () => {
        if (isCurrent()) setRestored(identity);
      },
      remainingSplashMs(startedAt, Date.now()),
    );
    void (async () => {
      try {
        if (ownerChanged || identity === "signed-out") await purgeMobileQueryStorage();
        if (!isCurrent() || identity === "signed-out" || !userId) return;
        const storage = await openMobileQueryStorage({ apiUrl, userId }, isCurrent);
        if (!storage || !isCurrent()) return;
        const persister = createSessionPersister(client, { apiUrl, userId }, storage, report);
        current.current = persister;
        const saved = persister.restoreClient();
        if (saved && isCurrent()) restoreSessionCache(client, saved, removed);
        if (!isCurrent()) {
          persister.stop();
          return;
        }
        unsubscribe = client.getQueryCache().subscribe((event) => {
          if (
            (event.type === "added" || event.type === "updated" || event.type === "removed") &&
            ownsPersistedQuery(event.query.queryKey, { apiUrl, userId })
          )
            persister.schedule();
        });
        persister.schedule();
      } catch {
        if (isCurrent()) report();
      } finally {
        stopTracking();
        clearTimeout(timer);
        if (isCurrent()) setRestored(identity);
      }
    })();
    return () => {
      ++generation.current;
      clearTimeout(timer);
      stopTracking();
      unsubscribe();
      current.current?.stop();
      current.current = undefined;
    };
  }, [identity, blocked, attempt, userId, startedAt, client, report]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") current.current?.flush();
    });
    return () => subscription.remove();
  }, []);

  const signOut = useCallback(
    async (work: () => Promise<void>) => {
      const ticket = ++generation.current;
      current.current?.stop();
      setBlocked(true);
      clearSessionQueryCache(client);
      useAppStore.getState().clearPending();
      try {
        // The marker is synchronous. A locked/hung key store must not prevent Clerk logout;
        // queued deletion continues, and its tombstone blocks subsequent disk restoration.
        try {
          void purgeMobileQueryStorage().catch(report);
        } catch {
          report();
        }
        await work();
      } finally {
        if (generation.current === ticket) clearSessionQueryCache(client);
        setBlocked(false);
        setAttempt((value) => value + 1); // Failed Clerk sign-out keeps its account, with fresh cache lifecycle.
      }
    },
    [client, report],
  );

  return (
    <QueryClientProvider client={client}>
      <MobileCacheContext value={{ restoring, signOut }}>
        <IsRestoringProvider value={restoring}>
          {children}
          {failed ? (
            <View className="bg-warning-soft" style={{ padding: 12 }}>
              <Typography accessibilityRole="alert" className="text-warning-soft-foreground">
                {t("Local storage is unavailable. Data will be refreshed online.")}
              </Typography>
            </View>
          ) : null}
        </IsRestoringProvider>
      </MobileCacheContext>
    </QueryClientProvider>
  );
}
