import {
  communityAccessDenied,
  useEvent,
  useEventActions,
  useEventTables,
  useEventWindow,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import { LayoutGrid, Pencil, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { CommunityConfirm } from "@/components/common/ui/CommunityConfirm";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
import { TabBar } from "@/components/common/ui/TabBar";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";
import { EventCard } from "./EventCard";
import { EventTableCard } from "./EventTableCard";

export function EventDetail({ eventId }: { eventId: string }) {
  const t = useT();
  const { i18n } = useLingui();
  const [muted, onAccent, danger] = useThemeColor(["muted", "accent-foreground", "danger"]);
  const o = useCommunityApi();
  const router = useRouter();
  const layout = useFloatingActionLayout();
  const detail = useEvent(o, eventId);
  const event = communityAccessDenied(detail.error) ? undefined : detail.data;
  const open = useEventWindow(event);
  const actions = useEventActions(o);
  const [tab, setTab] = useState("details");
  const [cancel, setCancel] = useState(false);
  const tables = useEventTables({ ...o, enabled: Boolean(event) && tab === "tables" }, eventId);
  const editable = Boolean(event?.canModify && open);
  const headerRight = editable
    ? () => (
        <Button
          isIconOnly
          variant="danger-soft"
          accessibilityLabel={t("Cancel event")}
          testID="cancel-event-header"
          isDisabled={actions.busy}
          onPress={() => setCancel(true)}
        >
          <Trash2 size={20} color={danger} />
        </Button>
      )
    : undefined;
  if (!event)
    return (
      <View style={{ padding: 20 }}>
        <Stack.Screen options={{ title: t("Events"), headerRight: undefined }} />
        {detail.isPending ? (
          <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
        ) : (
          <Button onPress={() => void detail.refetch()}>{t("Could not load event. Retry")}</Button>
        )}
      </View>
    );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: event.name, headerRight }} />
      <Tabs value={tab} onValueChange={setTab} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <TabBar>
            <Tabs.Trigger value="details" testID="event-tab-details" style={{ flex: 1 }}>
              <Tabs.Label>{t("Details")}</Tabs.Label>
            </Tabs.Trigger>
            <Tabs.Trigger value="tables" testID="event-tab-tables" style={{ flex: 1 }}>
              <Tabs.Label>{t("Tables")}</Tabs.Label>
            </Tabs.Trigger>
          </TabBar>
        </View>
        <Tabs.Content value="details" style={{ flex: 1 }}>
          <ScreenScrollView
            contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: layout.paddingBottom }}
          >
            <EventCard event={event} presentation="detail" />
            <Typography className="text-sm text-foreground">
              {t("Booking deadline")}:{" "}
              {new Intl.DateTimeFormat(i18n.locale, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: event.timeZone,
              }).format(new Date(event.bookingClosesAt))}{" "}
              · {event.timeZone}
            </Typography>
            {!open && event.status === "PUBLISHED" ? (
              <Typography className="text-foreground">
                {t("Bookings are closed. Results can still be recorded.")}
              </Typography>
            ) : null}
          </ScreenScrollView>
        </Tabs.Content>
        <Tabs.Content value="tables" style={{ flex: 1 }}>
          <FlatList
            testID="event-tables-scroll"
            style={{ flex: 1 }}
            data={tables.items}
            keyExtractor={(row) => row.id}
            contentContainerStyle={{
              padding: 20,
              gap: 12,
              paddingBottom: layout.paddingBottom,
              flexGrow: 1,
            }}
            onEndReachedThreshold={0.5}
            onEndReached={() => {
              if (
                tab === "tables" &&
                tables.hasNextPage &&
                !tables.isFetchingNextPage &&
                !tables.isFetchNextPageError
              )
                void tables.fetchNextPage();
            }}
            ListHeaderComponent={
              tables.isPending && !tables.items.length ? (
                <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
              ) : null
            }
            ListEmptyComponent={
              !tables.isPending && !tables.isError ? (
                <EmptyList icon={<LayoutGrid size={28} color={muted} />}>
                  {t("No tables found")}
                </EmptyList>
              ) : null
            }
            ListFooterComponent={
              <View>
                {tables.isError ? (
                  <Button onPress={() => void tables.refetch()}>
                    {t("Could not load tables. Retry")}
                  </Button>
                ) : null}
                {tables.isFetchingNextPage ? (
                  <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
                ) : null}
                {tables.isFetchNextPageError ? (
                  <Button onPress={() => void tables.fetchNextPage()}>{t("Retry")}</Button>
                ) : null}
              </View>
            }
            renderItem={({ item }) => <EventTableCard table={item} timeZone={event.timeZone} />}
          />
        </Tabs.Content>
      </Tabs>
      {editable ? (
        <FloatingActions
          label="Edit event"
          testID="edit-event-fab"
          isDisabled={actions.busy}
          onPress={() => router.push({ pathname: "/event/wizard", params: { eventId } })}
        >
          <Pencil size={24} color={onAccent} />
        </FloatingActions>
      ) : null}
      {cancel ? (
        <CommunityConfirm
          title={t("Cancel event")}
          description={t("All unfinished tables and reservations will be cancelled.")}
          busy={actions.busy}
          onCancel={() => {
            if (!actions.busy) setCancel(false);
          }}
          onConfirm={() => {
            if (!editable || actions.busy) return;
            void actions.cancel
              .mutateAsync(eventId)
              .then(() => router.replace("/events"))
              .catch(() => {});
          }}
        />
      ) : null}
    </View>
  );
}
