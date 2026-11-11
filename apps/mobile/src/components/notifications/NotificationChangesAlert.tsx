import type { NotificationChangeRow } from "@board-game-organizer/schemas";
import type { useNotificationChanges } from "@board-game-organizer/shared";
import { Alert } from "heroui-native/alert";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { BellRing, Check, ChevronDown, RotateCcw } from "lucide-react-native";
import { memo, useCallback } from "react";
import { View } from "react-native";
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
    <View style={{ paddingVertical: 4 }}>
      <Alert.Description style={{ flexShrink: 1 }}>{changeText(row, t)}</Alert.Description>
    </View>
  );
});

/** One explicit information read action. Pending invitations remain protected until their response. */
export function NotificationChangesAlert({ model }: { model: Model }) {
  const t = useT(),
    [warning, secondary] = useThemeColor(["warning", "default-foreground"]);
  const more = useCallback(() => {
    if (model.hasNextPage && !model.isFetchingNextPage) void model.fetchNextPage();
  }, [model.hasNextPage, model.isFetchingNextPage, model.fetchNextPage]);
  if (!model.changes.length && model.isPending)
    return <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />;
  if (!model.changes.length && !model.isError && !model.readError) return null;
  const canRead = model.changes.some((row) => !row.requiresResponse);
  return (
    <Alert
      status="warning"
      accessibilityLabel={t("New changes")}
      testID="notification-changes-alert"
      style={{ width: "100%", flexDirection: "row", alignItems: "flex-start", gap: 12 }}
    >
      <Alert.Indicator>
        <BellRing size={20} color={warning} accessible={false} />
      </Alert.Indicator>
      <Alert.Content style={{ flex: 1, minWidth: 0, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Alert.Title style={{ flexShrink: 1 }}>{t("New changes")}</Alert.Title>
          <NotificationUnreadDot active={model.changes.length > 0} />
        </View>
        {model.changes.length ? (
          <View
            testID="notification-changes-list"
            style={{
              width: "100%",
              minWidth: 0,
            }}
          >
            {model.changes.map((row) => (
              <ChangeRow key={key(row)} row={row} />
            ))}
          </View>
        ) : null}
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
              onPress={() =>
                void (model.isFetchNextPageError ? model.fetchNextPage() : model.refetch())
              }
            >
              <RotateCcw size={18} color={secondary} accessible={false} />
            </Button>
          </View>
        ) : null}
        {model.isFetchingNextPage ? (
          <Skeleton style={{ width: "100%", height: 32, borderRadius: 8 }} />
        ) : model.hasNextPage ? (
          <Button size="sm" variant="secondary" style={{ minHeight: 44 }} onPress={more}>
            <ChevronDown size={16} color={secondary} accessible={false} />
            <Button.Label>{t("More changes")}</Button.Label>
          </Button>
        ) : null}
      </Alert.Content>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        accessibilityLabel={t("Mark displayed changes as read")}
        testID="notification-changes-read"
        style={{ minWidth: 44, minHeight: 44, padding: 0, alignSelf: "flex-start" }}
        isDisabled={!canRead || model.isReading}
        onPress={() => {
          if (canRead && !model.isReading) model.markDisplayedAsRead();
        }}
      >
        <View
          accessible={false}
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check size={16} color={warning} accessible={false} />
        </View>
      </Button>
    </Alert>
  );
}
