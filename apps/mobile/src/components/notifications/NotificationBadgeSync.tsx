import { resolveApiUrl, useNotifications } from "@board-game-organizer/shared";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { AppState } from "react-native";
import { useSessionAuth } from "@/lib/useSessionAuth";

const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);

export function NotificationBadgeSync() {
  const { getToken, isLoaded, isSignedIn, userId } = useSessionAuth();
  const queryClient = useQueryClient();
  const { list } = useNotifications(
    { apiUrl, getToken, userId, enabled: isLoaded && Boolean(isSignedIn) },
    3,
  );
  const unreadCount = list.data?.pages[0]?.unreadCount;

  useEffect(() => {
    if (!isLoaded || (isSignedIn && (!list.isSuccess || unreadCount === undefined))) return;
    void Notifications.setBadgeCountAsync(isSignedIn ? (unreadCount ?? 0) : 0).catch(
      Sentry.captureException,
    );
  }, [isLoaded, isSignedIn, list.isSuccess, unreadCount]);

  useEffect(() => {
    if (!isSignedIn) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    const received = Notifications.addNotificationReceivedListener(refresh);
    return () => {
      appState.remove();
      received.remove();
    };
  }, [isSignedIn, queryClient]);

  return null;
}
