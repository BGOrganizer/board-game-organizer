import { notificationItemId } from "@board-game-organizer/schemas";
import {
  canManageEvent,
  communityAccessDenied,
  tableItemTargets,
  useEventRecord,
  useRecordTable,
} from "@board-game-organizer/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import {
  ChartNoAxesCombined,
  ClipboardPenLine,
  Info,
  Trophy,
  UsersRound,
} from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { HEADER_ICON_SIZE, headerButtonProps } from "@/components/common/layout/headerStyles";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDeleteAction } from "./EventDeleteAction";
import { EventTableInfo } from "./EventTableInfo";
import { EventTableLeaderboard } from "./EventTableLeaderboard";
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
  const { attention: initialAttention } = useLocalSearchParams<{ attention?: string }>();
  const invitationItem = notificationItemId(tableId, "invitation", undefined, "table");
  const [tab, setTab] = useState(() =>
    initialAttention === invitationItem ? "participants" : "overview",
  );
  const table =
    communityAccessDenied(q.error) || communityAccessDenied(event.error) ? undefined : q.data;
  const readOnly = Boolean(table?.readOnly || event.data?.readOnly);
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
  const selected =
    (tab === "results" && table.eventStatus !== "TERMINATED") ||
    (tab === "ranking" && (table.sharedResultsOnly || table.eventStatus === "PLANNING")) ||
    (tab === "participants" && table.sharedResultsOnly)
      ? "overview"
      : tab;
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
      readOnOpen={readOnly ? undefined : { kind: "table", id: tableId }}
    >
      <View style={{ flex: 1 }}>
        {header}
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <EventTableInfo table={table} />
        </View>
        <Tabs value={selected} onValueChange={setTab} style={{ flex: 1 }}>
          <View style={{ alignItems: "center", paddingTop: 12 }}>
            <TabBar style={{ alignSelf: "center", width: "auto" }}>
              <TabTrigger
                icon={Info}
                value="overview"
                testID="table-overview-tab"
                style={{ flexDirection: "row", gap: 6 }}
              >
                <Tabs.Label>{t("Details")}</Tabs.Label>
                <NotificationTabBadge target={{ kind: "table", id: tableId }} />
              </TabTrigger>
              {!table.sharedResultsOnly ? (
                <TabTrigger icon={UsersRound} value="participants" testID="table-participants-tab">
                  <Tabs.Label>{t("Participants")}</Tabs.Label>
                  <NotificationTabBadge target={{ kind: "item", id: invitationItem }} />
                </TabTrigger>
              ) : null}
              {table.eventStatus === "TERMINATED" ? (
                <TabTrigger icon={Trophy} value="results">
                  <Tabs.Label>{t("Results")}</Tabs.Label>
                </TabTrigger>
              ) : null}
              {!table.sharedResultsOnly && table.eventStatus !== "PLANNING" ? (
                <TabTrigger icon={ChartNoAxesCombined} value="ranking">
                  <Tabs.Label>{t("Ranking")}</Tabs.Label>
                </TabTrigger>
              ) : null}
            </TabBar>
          </View>
          <View style={{ flex: 1 }}>
            {selected === "ranking" ? (
              <EventTableLeaderboard table={table} />
            ) : selected === "results" ? (
              <EventTableResults table={table} />
            ) : (
              <EventTableOverview
                eventId={eventId}
                tableId={tableId}
                context={context}
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
