import type { NotificationChangeRow } from "@board-game-organizer/schemas";
import type { useNotificationChanges } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Popover } from "heroui-native/popover";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Bell, CheckCheck, RotateCcw } from "lucide-react-native";
import { memo, useCallback, useEffect, useState } from "react";
import { FlatList, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { NotificationUnreadDot } from "@/components/common/ui/NotificationUnreadDot";
import { useT } from "@/lib/i18n";

type Model = ReturnType<typeof useNotificationChanges>;
const key = (row: NotificationChangeRow) => `${row.notificationId}:${row.itemId ?? "generic"}`;
const messages = {
  event_agreement_ready: "Event planning is ready for confirmation.",
  event_agreement_blocked: "Event planning needs review. Check participant availability and votes.",
  event_confirmed: "The event has been confirmed.",
  event_replanning: "Event planning has reopened. Check dates, locations and votes.",
  event_terminated: "The event has ended. Results are available.",
  event_cancelled: "The event has been cancelled.",
  date: "Date updated",
  dates: "Date options changed",
  location: "Location updated",
  locations: "Location options changed",
  game: "Game updated",
  games: "Games changed",
  table_settings: "Table settings updated",
  tables: "Tables changed",
  group_info: "Group information updated",
  member_update: "Membership updated",
  participation: "Participation updated",
  event_state: "Event updated",
  invitation: "Invitation awaiting a response",
  proposal: "Proposal updated",
  review: "Review updated",
  information: "Information updated",
} as const;
function changeText(row: NotificationChangeRow, t: ReturnType<typeof useT>) {
  const message =
    row.messageCode === "invitation" && !row.requiresResponse
      ? t("Invitation updated")
      : t(messages[row.messageCode] ?? messages.information);
  return row.currentLabel ? `${message}: ${row.currentLabel}` : message;
}

const ChangeRow = memo(function ChangeRow({ row }: { row: NotificationChangeRow }) {
  const t = useT();
  return (
    <Typography className="text-foreground" style={{ paddingVertical: 6 }}>
      {changeText(row, t)}
    </Typography>
  );
});

/** Opening is informational; only the explicit resource action acknowledges changes. */
export function NotificationChangesPopover({ model }: { model: Model }) {
  const t = useT();
  const [dangerForeground, foreground] = useThemeColor([
    "danger-soft-foreground",
    "default-foreground",
  ]);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [headingHeight, setHeadingHeight] = useState(44);
  const [contentHeight, setContentHeight] = useState(0);
  const maxHeight = Math.max(0, height - insets.top - insets.bottom - 24);
  const maxWidth = Math.max(0, width - insets.left - insets.right - 24);
  const bodyHeight = Math.max(0, maxHeight - 24 - headingHeight - 8);
  const canRead = model.changes.some((row) => !row.requiresResponse) || model.hasNextPage;
  const unread =
    model.changes.length > 0 || Object.values(model.tabCounts).some((count) => count > 0);
  const more = useCallback(() => {
    if (
      open &&
      model.hasNextPage &&
      !model.isFetchingNextPage &&
      !model.isFetchNextPageError &&
      !model.isError
    )
      void model.fetchNextPage();
  }, [
    open,
    model.hasNextPage,
    model.isFetchingNextPage,
    model.isFetchNextPageError,
    model.isError,
    model.fetchNextPage,
  ]);
  useEffect(() => {
    if (open && !model.isPending && contentHeight <= bodyHeight) more();
  }, [open, model.isPending, contentHeight, bodyHeight, more]);
  const renderRow = useCallback(
    ({ item }: { item: NotificationChangeRow }) => <ChangeRow row={item} />,
    [],
  );
  return (
    <HelpPopover
      label={t("New changes")}
      icon={Bell}
      tone="warning"
      size="compact"
      width="content-fit"
      align="end"
      onOpenChange={(value) => {
        setOpen(value);
        model.resetWindow();
        if (value) setContentHeight(0);
      }}
      triggerClassName="bg-default"
      contentStyle={{
        minWidth: Math.min(260, maxWidth),
        maxWidth,
        minHeight: Math.min(96, maxHeight),
        maxHeight,
      }}
      indicator={
        unread ? (
          <View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0 }}>
            <NotificationUnreadDot active />
          </View>
        ) : undefined
      }
    >
      <View style={{ flexShrink: 1, gap: 8 }}>
        <View
          onLayout={(event) => setHeadingHeight(event.nativeEvent.layout.height)}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}
        >
          <Popover.Title accessibilityRole="header" style={{ flex: 1, minWidth: 0 }}>
            {t("New changes")}
          </Popover.Title>
          <Button
            isIconOnly
            size="sm"
            variant="danger-soft"
            testID="notification-changes-read"
            accessibilityLabel={t("Mark all changes as read")}
            style={{ minWidth: 44, minHeight: 44 }}
            isDisabled={!canRead || model.isReading || model.isPending}
            onPress={() => {
              if (canRead && !model.isReading && !model.isPending) void model.markAllAsRead();
            }}
          >
            <CheckCheck size={20} color={dangerForeground} accessible={false} />
          </Button>
        </View>
        {open ? (
          <FlatList
            testID="notification-changes-list"
            accessibilityLabel={t("Changes")}
            data={model.changes}
            keyExtractor={key}
            renderItem={renderRow}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={5}
            style={{ maxHeight: bodyHeight, flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{ minHeight: Math.min(20, bodyHeight) }}
            onContentSizeChange={(_width, measuredHeight) => setContentHeight(measuredHeight)}
            scrollEnabled={contentHeight > bodyHeight}
            showsVerticalScrollIndicator={contentHeight > bodyHeight}
            onEndReached={more}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              model.isPending ? (
                <Skeleton style={{ width: "100%", height: 48, borderRadius: 8 }} />
              ) : !model.isError ? (
                <Typography className="text-muted">{t("No new changes")}</Typography>
              ) : null
            }
            ListFooterComponent={
              <View style={{ gap: 8 }}>
                {model.changes.some((row) => row.requiresResponse) ? (
                  <Typography className="text-sm text-muted">
                    {t("Invitations remain unread until you respond.")}
                  </Typography>
                ) : null}
                {model.isError || model.readError ? (
                  <View accessibilityRole="alert" style={{ gap: 4 }}>
                    <Typography className="text-danger">
                      {model.readError
                        ? t("Could not mark changes as read. Try again.")
                        : t("Could not load changes. Try again.")}
                    </Typography>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="secondary"
                      accessibilityLabel={t("Try again")}
                      style={{ minWidth: 44, minHeight: 44 }}
                      isDisabled={model.isReading}
                      onPress={() => {
                        void (model.readError
                          ? model.markAllAsRead()
                          : model.isFetchNextPageError
                            ? model.fetchNextPage()
                            : model.refetch());
                      }}
                    >
                      <RotateCcw size={18} color={foreground} accessible={false} />
                    </Button>
                  </View>
                ) : null}
                {model.isFetchingNextPage ? (
                  <Skeleton style={{ width: "100%", height: 32, borderRadius: 8 }} />
                ) : null}
              </View>
            }
          />
        ) : null}
      </View>
    </HelpPopover>
  );
}
