import {
  communityAccessDenied,
  formatLocationAddress,
  useEvent,
  useEventActions,
  useEventTables,
  useEventWindow,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";

import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";

import { useState } from "react";
import { FlatList, View } from "react-native";

import { CommunityConfirm } from "@/components/common/ui/CommunityConfirm";

import { LinkedListCard } from "@/components/common/ui/LinkedListCard";

import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventDetail({ eventId }: { eventId: string }) {
  const t = useT();
  const o = useCommunityApi();
  const router = useRouter();
  const detail = useEvent(o, eventId);
  const event = communityAccessDenied(detail.error) ? undefined : detail.data;
  const open = useEventWindow(event);
  const actions = useEventActions(o);
  const [cancel, setCancel] = useState(false);
  const tables = useEventTables({ ...o, enabled: Boolean(event) }, eventId);
  if (!event)
    return (
      <View style={{ padding: 20 }}>
        {detail.isPending ? (
          <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
        ) : (
          <Button onPress={() => void detail.refetch()}>{t("Could not load event. Retry")}</Button>
        )}
      </View>
    );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: event.name }} />
      <FlatList
        style={{ flex: 1 }}
        data={tables.items}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 100 }}
        onEndReached={() => {
          if (tables.hasNextPage && !tables.isFetchingNextPage && !tables.isFetchNextPageError)
            void tables.fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Button
              variant="ghost"
              onPress={() => router.push(`/organization/${event.organizationId}`)}
            >
              {event.organizationName}
            </Button>
            <Typography>
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: event.timeZone,
              }).format(new Date(event.startsAt))}{" "}
              · {event.timeZone}
            </Typography>
            <Typography>
              {event.location.name} · {formatLocationAddress(event.location.address)}
            </Typography>
            <Typography>
              {t("Booking deadline")}:{" "}
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: event.timeZone,
              }).format(new Date(event.bookingClosesAt))}
            </Typography>
            {!open && event.status === "PUBLISHED" ? (
              <Typography>{t("Bookings are closed. Results can still be recorded.")}</Typography>
            ) : null}
            {event.role === "admin" && open ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  onPress={() => router.push({ pathname: "/event/wizard", params: { eventId } })}
                >
                  {t("Edit event")}
                </Button>
                <Button variant="danger" isDisabled={actions.busy} onPress={() => setCancel(true)}>
                  {t("Cancel event")}
                </Button>
              </View>
            ) : null}
            {tables.isPending ? (
              <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !tables.isPending && !tables.isError ? (
            <Typography>{t("No tables found")}</Typography>
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
        renderItem={({ item }) => (
          <LinkedListCard
            onPress={() =>
              router.push({ pathname: "/event/table", params: { eventId, tableId: item.id } })
            }
            label={`${t("Open table")}: ${item.name}`}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Typography className="font-semibold">{item.name}</Typography>
              <Typography>
                {item.gameName} · {item.confirmedCount}/{item.maxPlayers} {t("confirmed players")}
              </Typography>
              <Typography>
                {item.reservedCount} {t("reserved places")} ·{" "}
                {item.status === "PLANNING"
                  ? t("Planning")
                  : item.status === "CREATED"
                    ? t("Confirmed")
                    : item.status === "TERMINATED"
                      ? t("Finished")
                      : t("Cancelled")}
              </Typography>
            </View>
          </LinkedListCard>
        )}
      />
      {cancel ? (
        <CommunityConfirm
          title={t("Cancel event")}
          description={t("All unfinished tables and reservations will be cancelled.")}
          busy={actions.busy}
          onCancel={() => setCancel(false)}
          onConfirm={() =>
            void actions.cancel
              .mutateAsync(eventId)
              .then(() => router.replace("/events"))
              .catch(() => {})
          }
        />
      ) : null}
    </View>
  );
}
