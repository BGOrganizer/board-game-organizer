import { resolveApiUrl, useNotifications } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import { useLingui } from "@lingui/react";
import Constants from "expo-constants";
import { Redirect, Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Bell, CheckCheck, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { NotificationKindIcon } from "@/components/notifications/NotificationKindIcon";
import { useT } from "@/lib/i18n";
import { notificationHref } from "@/lib/notifications/push-notifications";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

export default function NotificationsScreen() {
  const { getToken, isLoaded, isSignedIn, userId, sessionId } = useAuth({
    treatPendingAsSignedOut: false,
  });
  const router = useRouter();
  const t = useT();
  const { i18n } = useLingui();
  const feedback = useMutationFeedback();
  const danger = useThemeColor("danger");
  const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
  const owner = JSON.stringify([apiUrl, userId, sessionId]);
  const [deletion, setDeletion] = useState<{ owner: string; id?: string } | null>(null);
  const deleting = isLoaded && isSignedIn && deletion?.owner === owner ? deletion : null;
  useEffect(() => {
    if (deletion && deletion.owner !== owner) setDeletion(null);
  }, [deletion, owner]);
  const notifications = useNotifications(
    {
      apiUrl,
      getToken,
      userId,
      enabled: isLoaded && Boolean(isSignedIn),
      feedback,
      locale: i18n.locale.startsWith("it") ? "it" : "en",
    },
    20,
  );

  if (isLoaded && !isSignedIn) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Button
              isIconOnly
              size="sm"
              variant="danger-soft"
              accessibilityLabel={t("Delete all notifications")}
              testID="delete-all-notifications"
              style={{ width: 44, height: 44 }}
              isDisabled={
                !isLoaded ||
                !isSignedIn ||
                notifications.busy ||
                !(
                  notifications.notifications.length ||
                  notifications.hasMore ||
                  notifications.unreadCount
                )
              }
              onPress={() => setDeletion({ owner })}
            >
              <Trash2 size={20} color={danger} accessible={false} />
            </Button>
          ),
        }}
      />
      <FlatList
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, paddingBottom: 72, gap: 12, flexGrow: 1 }}
        data={notifications.notifications}
        keyExtractor={(item) => item.id}
        onEndReached={() => {
          if (
            notifications.hasMore &&
            !notifications.busy &&
            !notifications.list.isFetchingNextPage &&
            !notifications.list.isFetchNextPageError
          )
            void notifications.list.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <>
            {notifications.unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                isDisabled={notifications.busy}
                onPress={() => notifications.markAllRead.mutate()}
              >
                <CheckCheck size={18} color="#737373" />
                <Button.Label>{t("Mark all as read")}</Button.Label>
              </Button>
            )}
            {notifications.list.isError && (
              <View
                className="rounded-xl border border-danger bg-danger/10 p-4"
                style={{ gap: 12 }}
              >
                <Typography className="text-danger">{t("Could not load notifications")}</Typography>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => void notifications.list.refetch()}
                >
                  {t("Try again")}
                </Button>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          notifications.list.isPending ? (
            <View
              accessibilityLabel={t("Loading notifications")}
              style={{ gap: 12, width: "100%" }}
            >
              {[0, 1, 2].map((index) => (
                <View
                  key={index}
                  className="rounded-xl border border-border bg-surface p-4"
                  style={{ gap: 8, width: "100%" }}
                >
                  <Skeleton style={{ height: 18, width: 180, borderRadius: 6 }} />
                  <Skeleton style={{ height: 14, width: "100%", borderRadius: 6 }} />
                </View>
              ))}
            </View>
          ) : notifications.list.isError ? null : (
            <EmptyList icon={<Bell size={28} color="#737373" />}>
              {t("No notifications yet")}
            </EmptyList>
          )
        }
        ListFooterComponent={
          notifications.hasMore ? (
            notifications.list.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 64, borderRadius: 12 }} />
            ) : (
              <Button
                variant="outline"
                isDisabled={notifications.busy}
                onPress={() => void notifications.list.fetchNextPage()}
              >
                {notifications.list.isFetchNextPageError
                  ? t("Could not load notifications. Retry")
                  : t("Load more")}
              </Button>
            )
          ) : null
        }
        renderItem={({ item }) => (
          <View
            className={`rounded-xl border bg-surface ${item.readAt ? "border-border" : "border-accent"}`}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.description}`}
              className="rounded-xl p-4 active:bg-muted/20"
              style={{ flexDirection: "row", gap: 10, width: "100%", paddingRight: 56 }}
              onPress={() => {
                if (!notifications.isBusy(item.id)) notifications.markRead.mutate(item.id);
                router.push(notificationHref({ href: item.href, kind: item.kind }));
              }}
            >
              <NotificationKindIcon kind={item.kind} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Typography className="font-medium text-foreground" style={{ flexShrink: 1 }}>
                    {item.title}
                  </Typography>
                  {!item.readAt && <View className="h-2 w-2 rounded-full bg-accent" />}
                </View>
                <Typography className="text-sm text-muted">{item.description}</Typography>
                <Typography className="text-xs text-muted">
                  {new Intl.DateTimeFormat(i18n.locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(item.createdAt))}
                </Typography>
              </View>
            </Pressable>
            <Button
              isIconOnly
              size="sm"
              variant="danger-soft"
              accessibilityLabel={t("Delete notification")}
              testID={`delete-notification-${item.id}`}
              hitSlop={8}
              isDisabled={notifications.isBusy(item.id)}
              style={{ position: "absolute", right: 8, bottom: 8, width: 40, height: 40 }}
              onPress={() => setDeletion({ owner, id: item.id })}
            >
              <Trash2 size={16} color={danger} accessible={false} />
            </Button>
          </View>
        )}
      />
      {deleting ? (
        <ConfirmDialog
          title={deleting.id ? t("Delete notification?") : t("Delete all notifications?")}
          description={
            deleting.id
              ? t("This notification will be permanently deleted.")
              : t("All notifications will be permanently deleted.")
          }
          busy={deleting.id ? notifications.isBusy(deleting.id) : notifications.busy}
          onCancel={() => setDeletion(null)}
          actions={[
            {
              label: deleting.id ? t("Delete notification") : t("Delete all notifications"),
              variant: "danger",
              onPress: () => {
                if (deleting.id) notifications.deleteNotification.mutate(deleting.id);
                else notifications.deleteAllNotifications.mutate();
                setDeletion(null);
              },
            },
          ]}
        />
      ) : null}
    </View>
  );
}
