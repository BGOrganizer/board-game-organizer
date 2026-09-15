import { resolveApiUrl, useNotifications } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Popover } from "heroui-native/popover";
import { Skeleton } from "heroui-native/skeleton";
import { Text } from "heroui-native/text";
import { Bell, CheckCheck } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { defaultI18n, useT } from "@/lib/i18n";
import { notificationHref, registerMobilePush } from "@/lib/push-notifications";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

export function NotificationBell() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();
  const t = useT();
  const registeredRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [permission, setPermission] = useState<Notifications.PermissionStatus | "unsupported">(
    "unsupported",
  );
  const [pushError, setPushError] = useState(false);
  const notifications = useNotifications(
    { apiUrl: apiUrl(), getToken, userId, enabled: isLoaded && Boolean(isSignedIn) },
    5,
  );
  const registerPushSubscription = notifications.registerPush.mutateAsync;
  const registrationPromiseRef = useRef<Promise<void> | null>(null);

  const registerPush = useCallback(() => {
    if (registrationPromiseRef.current) return registrationPromiseRef.current;
    const promise = (async () => {
      const result = await registerMobilePush();
      setPermission(
        result.status === "granted"
          ? Notifications.PermissionStatus.GRANTED
          : result.status === "denied"
            ? Notifications.PermissionStatus.DENIED
            : "unsupported",
      );
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

  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then((result) => {
        setPermission(result.status);
        if (result.status === "granted" && !registeredRef.current && isSignedIn) {
          return registerPush();
        }
      })
      .catch(() => setPushError(true));
  }, [isSignedIn, registerPush]);

  const openNotification = (id: string, href: string) => {
    notifications.markRead.mutate(id);
    setIsOpen(false);
    router.push(notificationHref({ href }));
  };
  const enablePush = () => registerPush().catch(() => setPushError(true));
  const countLabel = notifications.unreadCount > 99 ? "99+" : String(notifications.unreadCount);

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          accessibilityLabel={t("Notifications")}
          testID="notifications-button"
          style={{ minHeight: 36, minWidth: 36 }}
        >
          <Bell size={20} color="#737373" />
          {notifications.unreadCount > 0 && (
            <View
              pointerEvents="none"
              className="absolute -right-1 -top-1 min-w-5 items-center rounded-full bg-danger px-1"
              style={{ minHeight: 20, justifyContent: "center" }}
            >
              <Text className="text-[10px] font-bold text-white">{countLabel}</Text>
            </View>
          )}
        </Button>
      </Popover.Trigger>
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
              <Text className="text-sm text-danger">{t("Could not load notifications")}</Text>
            )}
            {!notifications.list.isPending &&
              !notifications.list.isError &&
              notifications.notifications.length === 0 && (
                <Text className="py-3 text-sm text-muted">{t("No notifications yet")}</Text>
              )}
            {notifications.notifications.map((notification) => (
              <Pressable
                key={notification.id}
                accessibilityRole="button"
                accessibilityLabel={`${notification.title}. ${notification.description}`}
                onPress={() => openNotification(notification.id, notification.href)}
                className="rounded-lg p-2 active:bg-muted/20"
                style={{ flexDirection: "row", gap: 8, width: "100%" }}
              >
                {!notification.readAt && (
                  <View className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text className="text-sm font-medium">{notification.title}</Text>
                  <Text className="text-xs text-muted" numberOfLines={2}>
                    {notification.description}
                  </Text>
                  <Text className="text-[10px] text-muted">
                    {new Intl.DateTimeFormat(defaultI18n.locale, {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(notification.createdAt))}
                  </Text>
                </View>
              </Pressable>
            ))}

            {permission === "undetermined" && (
              <Button size="sm" variant="outline" onPress={enablePush}>
                {t("Enable push notifications")}
              </Button>
            )}
            {permission === "denied" && (
              <Button size="sm" variant="outline" onPress={() => void Linking.openSettings()}>
                {t("Open notification settings")}
              </Button>
            )}
            {pushError && (
              <Text className="text-xs text-danger">
                {t("Could not enable push notifications")}
              </Text>
            )}
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
          </View>
          <Popover.Arrow />
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
