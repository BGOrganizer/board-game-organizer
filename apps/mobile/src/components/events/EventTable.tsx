import { notificationItemId } from "@board-game-organizer/schemas";
import {
  canManageEvent,
  communityAccessDenied,
  tableItemTargets,
  useEventRecord,
  useNotificationChanges,
  useRecordTable,
} from "@board-game-organizer/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import { ClipboardPenLine, Info, Trophy, UsersRound } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { HEADER_ICON_SIZE, headerButtonProps } from "@/components/common/layout/headerStyles";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationChangesPopover } from "@/components/notifications/NotificationChangesPopover";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDeleteAction } from "./EventDeleteAction";
import { EventTableInfo } from "./EventTableInfo";
import { EventTableOverview } from "./EventTableOverview";
import { EventTableResults } from "./EventTableResults";
export function EventTable({
  eventId,
  tableId,
  context = "personal",
}: {
  eventId: string;
  tableId: string;
  context?: "personal" | "event";
}) {
  const t = useT(),
    o = useCommunityApi(),
    q = useRecordTable(o, eventId, tableId),
    event = useEventRecord(o, eventId),
    router = useRouter(),
    foreground = useThemeColor("accent-foreground");
  const { attention: initialAttention, tab: initialTab } = useLocalSearchParams<{
    attention?: string;
    tab?: string;
  }>();
  const invitationItem = notificationItemId(tableId, "invitation", undefined, "table");
  const [tab, setTab] = useState(() =>
    initialTab === "participants" || initialAttention === invitationItem
      ? "participants"
      : "overview",
  );
  const table =
    communityAccessDenied(q.error) || communityAccessDenied(event.error) ? undefined : q.data;
  const readOnly = Boolean(table?.readOnly || event.data?.readOnly);
  const selected =
    (tab === "results" && table?.eventStatus === "PLANNING") ||
    (tab === "participants" && table?.sharedResultsOnly)
      ? "overview"
      : tab;
  const changes = useNotificationChanges(
    {
      ...o,
      enabled: o.enabled !== false && Boolean(table) && !readOnly && !table?.sharedResultsOnly,
    },
    {
      kind: "table",
      id: tableId,
      tab: "all",
    },
  );
  const header = (
    <Stack.Screen
      options={{
        title: table?.name ?? t("Table details"),
        headerRight: () =>
          table && event.data ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {!readOnly &&
              canManageEvent(event.data, o.userId) &&
              event.data.status === "CONFIRMED" &&
              event.data.canFinalize &&
              table.eventStatus === "CONFIRMED" &&
              table.confirmed ? (
                <Button
                  {...headerButtonProps}
                  variant="primary"
                  accessibilityLabel={t("Register result")}
                  testID="table-register-result"
                  isDisabled={q.isPlaceholderData || event.isPlaceholderData}
                  onPress={() =>
                    router.push({ pathname: "/event/results", params: { eventId, tableId } })
                  }
                >
                  <ClipboardPenLine size={HEADER_ICON_SIZE} color={foreground} accessible={false} />
                </Button>
              ) : null}
              <EventDeleteAction
                event={event.data}
                table={table}
                disabled={q.isPlaceholderData || event.isPlaceholderData}
              />
            </View>
          ) : null,
      }}
    />
  );
  if (!table)
    return (
      <NotificationAttentionScope options={o} targets={[]}>
        {header}
        <EventTableOverview eventId={eventId} tableId={tableId} context={context} />
      </NotificationAttentionScope>
    );
  const detailHeader = (
    <View style={{ gap: 12 }}>
      <EventTableInfo
        table={table}
        titleAction={
          !readOnly && !table.sharedResultsOnly ? (
            <NotificationChangesPopover model={changes} />
          ) : undefined
        }
      />
      <View style={{ alignItems: "center" }}>
        <TabBar style={{ alignSelf: "center", width: "auto" }}>
          <TabTrigger
            icon={Info}
            value="overview"
            testID="table-overview-tab"
            style={{ flexDirection: "row", gap: 6 }}
          >
            <Tabs.Label>{t("Details")}</Tabs.Label>
            <NotificationTabBadge
              target={{ kind: "table", id: tableId }}
              count={changes.tabCounts.details}
            />
          </TabTrigger>
          {!table.sharedResultsOnly ? (
            <TabTrigger icon={UsersRound} value="participants" testID="table-participants-tab">
              <Tabs.Label>{t("Participants")}</Tabs.Label>
              <NotificationTabBadge
                target={{ kind: "item", id: invitationItem }}
                count={changes.tabCounts.participants}
              />
            </TabTrigger>
          ) : null}
          {table.eventStatus !== "PLANNING" ? (
            <TabTrigger icon={Trophy} value="results" testID="table-results-tab">
              <Tabs.Label>{t("Results")}</Tabs.Label>
            </TabTrigger>
          ) : null}
        </TabBar>
      </View>
    </View>
  );
  return (
    <NotificationAttentionScope
      options={o}
      targets={
        readOnly
          ? []
          : [
              { kind: "table", id: tableId },
              { kind: "event", id: eventId },
              ...tableItemTargets(table),
            ]
      }
    >
      <View style={{ flex: 1 }}>
        {header}
        <Tabs value={selected} onValueChange={setTab} style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            {selected === "results" ? (
              <EventTableResults table={table} header={detailHeader} />
            ) : (
              <EventTableOverview
                eventId={eventId}
                tableId={tableId}
                context={context}
                header={detailHeader}
                section={selected === "participants" ? "participants" : "overview"}
              />
            )}
          </View>
        </Tabs>
        {q.isError && selected !== "overview" ? (
          <View>
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not load complete table details")}
            </Typography>
            <Button onPress={() => void q.refetch()}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </View>
        ) : null}
      </View>
    </NotificationAttentionScope>
  );
}
