import { useEventTableContext, useEventTableMatch } from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import { ArrowLeft, LayoutGrid } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { HeaderTitle } from "@/components/common/layout/HeaderTitle";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
import { TabBar } from "@/components/common/ui/TabBar";
import { MatchDetail } from "@/components/matches/MatchDetail";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableEditAction } from "./EventTableEditAction";
import { EventTableOverview } from "./EventTableOverview";
import { EventTablePlayers } from "./EventTablePlayers";

export function EventTable({ eventId, tableId }: { eventId: string; tableId: string }) {
  const t = useT();
  const router = useRouter();
  const foreground = useThemeColor("foreground");
  const options = useCommunityApi();
  const context = useEventTableContext(options, eventId, tableId);
  const [tab, setTab] = useState("overview");
  const { event, table } = context;
  const match = useEventTableMatch(options, table?.matchId);
  const header = (
    <Stack.Screen
      options={{
        title: t("Table details"),
        headerTitle: () => <HeaderTitle title={t("Table details")} icon={LayoutGrid} />,
        headerBackVisible: false,
        headerLeft: () => (
          <Button
            isIconOnly
            variant="ghost"
            style={{ minWidth: 44, minHeight: 44 }}
            accessibilityLabel={t("Back to event")}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace({ pathname: "/event/[eventId]", params: { eventId } });
            }}
          >
            <ArrowLeft size={24} color={foreground} />
          </Button>
        ),
      }}
    />
  );
  if (!event || !table)
    return (
      <View style={{ flex: 1, padding: 20, gap: 12 }}>
        {header}
        {context.eventQuery.isPending || (event && context.tableQuery.isPending) ? (
          <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
        ) : (
          <>
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not load table")}
            </Typography>
            <Button
              onPress={() => {
                void context.eventQuery.refetch();
                if (event) void context.tableQuery.refetch();
              }}
            >
              {t("Retry")}
            </Button>
          </>
        )}
      </View>
    );
  if (table.matchId && match.data)
    return (
      <View style={{ flex: 1 }}>
        {header}
        <MatchDetail matchId={table.matchId} initialTab={tab} />
      </View>
    );
  return (
    <View style={{ flex: 1 }}>
      {header}
      {match.error ? (
        <View>
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Could not load match details")}
          </Typography>
          <Button
            onPress={() => {
              void match.refetch();
            }}
          >
            {t("Retry")}
          </Button>
        </View>
      ) : null}
      <Tabs value={tab} onValueChange={setTab} variant="primary" style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <TabBar>
            <Tabs.Trigger value="overview" style={{ flex: 1 }}>
              <Tabs.Label>{t("Overview")}</Tabs.Label>
            </Tabs.Trigger>
            <Tabs.Trigger value="players" testID="table-players-tab" style={{ flex: 1 }}>
              <Tabs.Label>{t("Seats")}</Tabs.Label>
            </Tabs.Trigger>
          </TabBar>
        </View>
        <Tabs.Content value="overview" style={{ flex: 1 }}>
          {tab === "overview" ? (
            <ScreenScrollView>
              <EventTableOverview eventId={eventId} tableId={tableId} />
            </ScreenScrollView>
          ) : null}
        </Tabs.Content>
        <Tabs.Content value="players" style={{ flex: 1 }}>
          {tab === "players" ? (
            <EventTablePlayers key={`${eventId}/${tableId}`} eventId={eventId} tableId={tableId} />
          ) : null}
        </Tabs.Content>
      </Tabs>
      <EventTableEditAction eventId={eventId} tableId={tableId} />
    </View>
  );
}
