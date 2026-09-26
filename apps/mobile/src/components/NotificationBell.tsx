import { resolveApiUrl, useNotifications } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Popover } from "heroui-native/popover";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Bell, CheckCheck } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, View } from "react-native";
import { defaultI18n, useT } from "@/lib/i18n";
import {
  notificationHref,
  registerMobilePush,
  requestMobilePushPermission,
} from "@/lib/push-notifications";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

export function NotificationBell() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();
  const t = useT();
  const registeredRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [permission, setPermission] = useState<{
    status: Notifications.PermissionStatus | "unsupported";
    canAskAgain: boolean;
  }>({ status: "unsupported", canAskAgain: false });
  const [pushError, setPushError] = useState(false);
  const notifications = useNotifications(
    {
      apiUrl: apiUrl(),
      getToken,
      userId,
      enabled: isLoaded && Boolean(isSignedIn),
    },
    5,
  );
  const registerPushSubscription = notifications.registerPush.mutateAsync;
  const registrationPromiseRef = useRef<Promise<void> | null>(null);

  const registerPush = useCallback(() => {
    if (registrationPromiseRef.current) return registrationPromiseRef.current;
    const promise = (async () => {
      const result = await registerMobilePush();
      setPermission({
        status:
          result.status === "granted"
            ? Notifications.PermissionStatus.GRANTED
            : result.status === "denied"
              ? Notifications.PermissionStatus.DENIED
              : "unsupported",
        canAskAgain: result.status === "denied" && result.canAskAgain,
      });
      if (result.status !== "granted") {
        setPushError(result.status === "unsupported");
        return;
      }
      await registerPushSubscription({
        token: result.token,
        platform: result.platform,
        locale: defaultI18n.locale.startsWith("it") ? "it" : "en",
      });
      registeredRef.current = true;
      setPushError(false);
    })().finally(() => {
      registrationPromiseRef.current = null;
    });
    registrationPromiseRef.current = promise;
    return promise;
  }, [registerPushSubscription]);

  const refreshPermission = useCallback(async () => {
    const result = await Notifications.getPermissionsAsync();
    setPermission({ status: result.status, canAskAgain: result.canAskAgain });
    return result;
  }, []);

  const refreshPermissionAndRegister = useCallback(async () => {
    const result = await refreshPermission();
    if (result.status === "granted" && !registeredRef.current && isSignedIn) {
      await registerPush();
    }
  }, [isSignedIn, refreshPermission, registerPush]);

  useEffect(() => {
    refreshPermissionAndRegister().catch(() => setPushError(true));
  }, [refreshPermissionAndRegister]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshPermissionAndRegister().catch(() => setPushError(true));
      }
    });
    return () => subscription.remove();
  }, [refreshPermissionAndRegister]);

  const requestPermissionFromBell = useCallback(async () => {
    const result = await requestMobilePushPermission();
    setPermission({
      status:
        result.status === "granted"
          ? Notifications.PermissionStatus.GRANTED
          : result.status === "denied"
            ? Notifications.PermissionStatus.DENIED
            : "unsupported",
      canAskAgain: result.status === "denied" && result.canAskAgain,
    });
    if (result.status === "granted" && !registeredRef.current && isSignedIn) {
      await registerPush();
    }
  }, [isSignedIn, registerPush]);

  const openNotification = (id: string, href: string, kind: string) => {
    notifications.markRead.mutate(id);
    setIsOpen(false);
    router.push(notificationHref({ href, kind }));
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setPushError(false);
      requestPermissionFromBell().catch(() => setPushError(true));
    }
  };
  const countLabel = notifications.unreadCount > 99 ? "99+" : String(notifications.unreadCount);

  return (
    <Popover isOpen={isOpen} onOpenChange={handleOpenChange}>
      <View
        style={{
          width: 44,
          height: 40,
          alignItems: "center",
          justifyContent: "center",
          overflow: "visible",
        }}
      >
        <Popover.Trigger asChild>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            accessibilityLabel={t("Notifications")}
            testID="notifications-button"
            style={{ minHeight: 36, minWidth: 36 }}
          >
            <Bell size={20} color="#737373" />
          </Button>
        </Popover.Trigger>
        {notifications.unreadCount > 0 && (
          <View
            pointerEvents="none"
            className="absolute items-center bg-danger"
            style={{
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              justifyContent: "center",
              paddingHorizontal: countLabel.length > 1 ? 3 : 0,
              right: 1,
              top: 1,
              zIndex: 1,
            }}
          >
            <Typography style={{ color: "white", fontSize: 9, fontWeight: "700", lineHeight: 11 }}>
              {countLabel}
            </Typography>
          </View>
        )}
      </View>
      <Popover.Portal>
        <Popover.Overlay />
        <Popover.Content presentation="popover" placement="bottom" align="end" width={320}>
          <View style={{ width: "100%", gap: 8 }} className="p-3">
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Popover.Title>{t("Notifications")}</Popover.Title>
              {notifications.unreadCount > 0 && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  accessibilityLabel={t("Mark all as read")}
                  onPress={() => notifications.markAllRead.mutate()}
                >
                  <CheckCheck size={18} color="#737373" />
                </Button>
              )}
            </View>

            {notifications.list.isPending && (
              <View
                accessibilityLabel={t("Loading notifications")}
                style={{ gap: 8, width: "100%" }}
              >
                {[0, 1].map((index) => (
                  <View key={index} style={{ gap: 6, width: "100%" }}>
                    <Skeleton style={{ height: 16, width: 150, borderRadius: 6 }} />
                    <Skeleton style={{ height: 12, width: "100%", borderRadius: 6 }} />
                  </View>
                ))}
              </View>
            )}
            {notifications.list.isError && (
              <Typography className="text-sm text-danger">
                {t("Could not load notifications")}
              </Typography>
            )}
            {!notifications.list.isPending &&
              !notifications.list.isError &&
              notifications.notifications.length === 0 && (
                <Typography className="py-3 text-sm text-muted">
                  {t("No notifications yet")}
                </Typography>
              )}
            {notifications.notifications.map((notification) => (
              <Pressable
                key={notification.id}
                accessibilityRole="button"
                accessibilityLabel={`${notification.title}. ${notification.description}`}
                onPress={() =>
                  openNotification(notification.id, notification.href, notification.kind)
                }
                className="rounded-lg p-2 active:bg-muted/20"
                style={{ flexDirection: "row", gap: 8, width: "100%" }}
              >
                {!notification.readAt && (
                  <View className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Typography className="text-sm font-medium">{notification.title}</Typography>
                  <Typography className="text-xs text-muted" numberOfLines={2}>
                    {notification.description}
                  </Typography>
                  <Typography className="text-[10px] text-muted">
                    {new Intl.DateTimeFormat(defaultI18n.locale, {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(notification.createdAt))}
                  </Typography>
                </View>
              </Pressable>
            ))}

            {permission.status === "denied" && !permission.canAskAgain && (
              <Button size="sm" variant="outline" onPress={() => void Linking.openSettings()}>
                {t("Open notification settings")}
              </Button>
            )}
            {pushError && (
              <Typography className="text-xs text-danger">
                {t("Could not enable push notifications")}
              </Typography>
            )}
            {permission.status === "granted" && (
              <Button
                size="sm"
                variant="ghost"
                onPress={() => {
                  setIsOpen(false);
                  router.push("/notifications");
                }}
              >
                {t("View all notifications")}
              </Button>
            )}
          </View>
          <Popover.Arrow />
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
