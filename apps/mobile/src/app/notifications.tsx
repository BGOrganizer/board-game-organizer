import { resolveApiUrl, useNotifications } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { Redirect, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CheckCheck } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { defaultI18n, useT } from "@/lib/i18n";
import { notificationHref } from "@/lib/push-notifications";

export default function NotificationsScreen() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth({ treatPendingAsSignedOut: false });
  const router = useRouter();
  const t = useT();
  const notifications = useNotifications(
    {
      apiUrl: resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined),
      getToken,
      userId,
      enabled: isLoaded && Boolean(isSignedIn),
    },
    20,
  );

  if (isLoaded && !isSignedIn) return <Redirect href="/" />;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 12 }}
      className="flex-1 bg-background"
    >
      {notifications.unreadCount > 0 && (
        <Button variant="ghost" size="sm" onPress={() => notifications.markAllRead.mutate()}>
          <CheckCheck size={18} color="#737373" />
          {t("Mark all as read")}
        </Button>
      )}

      {notifications.list.isPending && (
        <View accessibilityLabel={t("Loading notifications")} style={{ gap: 12, width: "100%" }}>
          {[0, 1, 2].map((index) => (
            <View
              key={index}
              className="rounded-xl border border-border p-4"
              style={{ gap: 8, width: "100%" }}
            >
              <Skeleton style={{ height: 18, width: 180, borderRadius: 6 }} />
              <Skeleton style={{ height: 14, width: "100%", borderRadius: 6 }} />
            </View>
          ))}
        </View>
      )}

      {notifications.list.isError && (
        <View className="rounded-xl border border-danger bg-danger/10 p-4" style={{ gap: 12 }}>
          <Typography className="text-danger">{t("Could not load notifications")}</Typography>
          <Button size="sm" variant="outline" onPress={() => void notifications.list.refetch()}>
            {t("Try again")}
          </Button>
        </View>
      )}

      {!notifications.list.isPending &&
        !notifications.list.isError &&
        notifications.notifications.length === 0 && (
          <Typography className="rounded-xl border border-border p-8 text-center text-muted">
            {t("No notifications yet")}
          </Typography>
        )}

      {notifications.notifications.map((notification) => (
        <Pressable
          key={notification.id}
          accessibilityRole="button"
          accessibilityLabel={`${notification.title}. ${notification.description}`}
          className={`rounded-xl border p-4 active:bg-muted/20 ${
            notification.readAt ? "border-border" : "border-accent bg-accent/5"
          }`}
          style={{ flexDirection: "row", gap: 10, width: "100%" }}
          onPress={() => {
            notifications.markRead.mutate(notification.id);
            router.push(notificationHref({ href: notification.href, kind: notification.kind }));
          }}
        >
          {!notification.readAt && <View className="mt-2 h-2 w-2 rounded-full bg-accent" />}
          <View style={{ flex: 1, gap: 4 }}>
            <Typography className="font-medium">{notification.title}</Typography>
            <Typography className="text-sm text-muted">{notification.description}</Typography>
            <Typography className="text-xs text-muted">
              {new Intl.DateTimeFormat(defaultI18n.locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(notification.createdAt))}
            </Typography>
          </View>
        </Pressable>
      ))}

      {notifications.hasMore && (
        <Button
          variant="outline"
          isDisabled={notifications.list.isFetchingNextPage}
          onPress={() => void notifications.list.fetchNextPage()}
        >
          {notifications.list.isFetchingNextPage ? t("Loading notifications") : t("Load more")}
        </Button>
      )}
    </ScrollView>
  );
}
