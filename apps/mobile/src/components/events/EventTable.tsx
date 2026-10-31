import {
  communityAccessDenied,
  useEventRecord,
  useRecordTable,
} from "@board-game-organizer/shared";
import { Stack } from "expo-router";
import { Button } from "heroui-native/button";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import { useState } from "react";
import { View } from "react-native";
import { TabBar } from "@/components/common/ui/TabBar";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDeleteAction } from "./EventDeleteAction";
import { EventTableLeaderboard } from "./EventTableLeaderboard";
import { EventTableOverview } from "./EventTableOverview";
import { EventTableResults } from "./EventTableResults";
export function EventTable({ eventId, tableId }: { eventId: string; tableId: string }) {
  const t = useT(),
    o = useCommunityApi(),
    q = useRecordTable(o, eventId, tableId),
    event = useEventRecord(o, eventId);
  const [tab, setTab] = useState("overview");
  const table =
    communityAccessDenied(q.error) || communityAccessDenied(event.error) ? undefined : q.data;
  const header = (
    <Stack.Screen
      options={{
        title: table?.name ?? t("Table details"),
        headerRight: () =>
          table && event.data ? (
            <EventDeleteAction
              event={event.data}
              table={table}
              disabled={q.isPlaceholderData || event.isPlaceholderData}
            />
          ) : null,
      }}
    />
  );
  if (!table || table.eventStatus === "PLANNING")
    return (
      <>
        {header}
        <EventTableOverview eventId={eventId} tableId={tableId} />
      </>
    );
  const selected = tab === "results" && table.eventStatus !== "TERMINATED" ? "overview" : tab;
  return (
    <View style={{ flex: 1 }}>
      {header}
      <Tabs value={selected} onValueChange={setTab} style={{ flex: 1 }}>
        <View style={{ alignItems: "center", paddingTop: 12 }}>
          <TabBar style={{ alignSelf: "center", width: "auto" }}>
            <Tabs.Trigger value="overview">
              <Tabs.Label>{t("Overview")}</Tabs.Label>
            </Tabs.Trigger>
            {table.eventStatus === "TERMINATED" ? (
              <Tabs.Trigger value="results">
                <Tabs.Label>{t("Results")}</Tabs.Label>
              </Tabs.Trigger>
            ) : null}
            <Tabs.Trigger value="ranking">
              <Tabs.Label>{t("Ranking")}</Tabs.Label>
            </Tabs.Trigger>
          </TabBar>
        </View>
        <View style={{ flex: 1 }}>
          {selected === "ranking" ? (
            <EventTableLeaderboard table={table} />
          ) : selected === "results" ? (
            <EventTableResults table={table} />
          ) : (
            <EventTableOverview eventId={eventId} tableId={tableId} />
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
  );
}
