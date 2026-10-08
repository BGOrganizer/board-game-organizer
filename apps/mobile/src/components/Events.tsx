import {
  type BookingAction,
  communityAccessDenied,
  formatLocationAddress,
  useEvent,
  useEventActions,
  useEventBookings,
  useEventList,
  useEventTable,
  useEventTables,
  useEventWindow,
  useOrganizationMembers,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Check, Plus, Trash2, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommunityConfirm } from "@/components/CommunityConfirm";
import { FloatingActions } from "@/components/FloatingActions";
import { LinkedListCard } from "@/components/LinkedListCard";
import { floatingActionLayout } from "@/lib/floating-actions";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function Events({ organizationId = "" }: { organizationId?: string }) {
  const t = useT();
  const o = useCommunityApi();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim().length >= 4 ? query.trim() : ""), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const list = useEventList(o, organizationId, search);
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        style={{ flex: 1 }}
        data={communityAccessDenied(list.error) ? [] : list.items}
        keyExtractor={(row) => row.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 20,
          gap: 12,
          paddingBottom: floatingActionLayout(insets.bottom, 16).paddingBottom,
        }}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError)
            void list.fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Input
              accessibilityLabel={t("Search events")}
              value={query}
              onChangeText={setQuery}
              maxLength={120}
            />
            <Button variant="ghost" onPress={() => setQuery("")}>
              {t("Clear")}
            </Button>
            {list.isPending ? (
              <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !list.isPending && !list.isError ? <Typography>{t("No events found")}</Typography> : null
        }
        ListFooterComponent={
          <View style={{ gap: 8 }}>
            {list.isError ? (
              <Button onPress={() => void list.refetch()}>
                {t("Could not load events. Retry")}
              </Button>
            ) : null}
            {list.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
            ) : null}
            {list.isFetchNextPageError ? (
              <Button onPress={() => void list.fetchNextPage()}>{t("Retry")}</Button>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <LinkedListCard
            onPress={() => router.push(`/event/${item.id}`)}
            label={`${t("Open event")}: ${item.name}`}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Typography className="font-semibold">{item.name}</Typography>
              <Typography>
                {item.organizationName} · {item.status === "DRAFT" ? t("Draft") : t("Published")}
              </Typography>
              <Typography>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: item.timeZone,
                }).format(new Date(item.startsAt))}
              </Typography>
              <Typography className="text-muted">
                {formatLocationAddress(item.location.address)}
              </Typography>
            </View>
          </LinkedListCard>
        )}
      />
      <FloatingActions
        label="New event"
        testID="new-event-fab"
        onPress={() =>
          router.push({
            pathname: "/event/wizard",
            params: organizationId ? { organizationId } : {},
          })
        }
        extraBottom={16}
      >
        <Plus color="#fff" size={26} />
      </FloatingActions>
    </View>
  );
}
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
export function EventTableDetail({ eventId, tableId }: { eventId: string; tableId: string }) {
  const t = useT();
  const o = useCommunityApi();
  const router = useRouter();
  const eq = useEvent(o, eventId);
  const event = communityAccessDenied(eq.error) ? undefined : eq.data;
  const tq = useEventTable({ ...o, enabled: Boolean(event) }, eventId, tableId);
  const table = communityAccessDenied(tq.error) ? undefined : tq.data;
  const open = useEventWindow(event);
  const actions = useEventActions(o);
  const primaryIcon = useThemeColor("accent-foreground");
  const dangerIcon = useThemeColor("danger");
  const [confirm, setConfirm] = useState<{ id: string; action: BookingAction } | null>(null);
  const [invite, setInvite] = useState(false);
  const bookings = useEventBookings(
    { ...o, enabled: Boolean(event && event.role !== "visitor" && table) },
    eventId,
    tableId,
  );
  const members = useOrganizationMembers(
    { ...o, enabled: invite && event?.role === "admin" && open },
    event?.organizationId ?? "",
    "accepted",
  );
  const act = (id: string, action: BookingAction) => {
    if (["cancel", "remove"].includes(action)) setConfirm({ id, action });
    else void actions.booking.mutateAsync({ id, action, eventId }).catch(() => {});
  };
  if (!event || !table)
    return (
      <View style={{ padding: 20 }}>
        {eq.isPending || (Boolean(event) && tq.isPending) ? (
          <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
        ) : (
          <Button
            onPress={() => {
              void eq.refetch();
              if (event) void tq.refetch();
            }}
          >
            {t("Could not load table. Retry")}
          </Button>
        )}
      </View>
    );
  const mine = table.myBooking;
  const admin = event.role === "admin";
  if (invite && admin && open)
    return (
      <FlatList
        style={{ flex: 1 }}
        data={members.items}
        keyExtractor={(m) => m.userId}
        contentContainerStyle={{ padding: 20, gap: 12 }}
        onEndReached={() => {
          if (members.hasNextPage && !members.isFetchingNextPage && !members.isFetchNextPageError)
            void members.fetchNextPage();
        }}
        ListHeaderComponent={<Button onPress={() => setInvite(false)}>{t("Back")}</Button>}
        ListFooterComponent={
          <View>
            {members.isPending || members.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
            ) : null}
            {members.isError ? (
              <Button onPress={() => void members.refetch()}>{t("Retry")}</Button>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Button
            isDisabled={actions.busy || bookings.items.some((b) => b.userId === item.userId)}
            onPress={() =>
              void actions.invite
                .mutateAsync({ eventId, tableId, userId: item.userId })
                .then(() => setInvite(false))
                .catch(() => {})
            }
          >
            {item.username ?? t("Username unavailable")}
          </Button>
        )}
      />
    );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: table.name }} />
      <FlatList
        style={{ flex: 1 }}
        data={communityAccessDenied(bookings.error) ? [] : bookings.items}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 100 }}
        onEndReached={() => {
          if (
            bookings.hasNextPage &&
            !bookings.isFetchingNextPage &&
            !bookings.isFetchNextPageError
          )
            void bookings.fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Button variant="ghost" onPress={() => router.push(`/event/${eventId}`)}>
              {t("Back to event")}
            </Button>
            <Typography className="font-semibold">{table.gameName}</Typography>
            <Typography>
              {new Intl.DateTimeFormat(undefined, {
                timeStyle: "short",
                timeZone: event.timeZone,
              }).format(new Date(table.startsAt))}{" "}
              –{" "}
              {new Intl.DateTimeFormat(undefined, {
                timeStyle: "short",
                timeZone: event.timeZone,
              }).format(new Date(table.endsAt))}
            </Typography>
            <Typography>
              {table.confirmedCount}/{table.maxPlayers} {t("confirmed players")} ·{" "}
              {table.reservedCount} {t("reserved places")}
            </Typography>
            <Typography>
              {t("Minimum players")}: {table.minPlayers}
            </Typography>
            <Typography>
              {table.openSkill ? t("Global ratings enabled") : t("Global ratings disabled")}
            </Typography>
            {table.demonstrator ? (
              <Typography>
                {t("Demonstrator")}: {table.demonstrator.username ?? t("Username unavailable")}
              </Typography>
            ) : null}
            {open && table.canBook ? (
              <Button
                isDisabled={actions.busy}
                onPress={() =>
                  void actions.request.mutateAsync({ eventId, tableId }).catch(() => {})
                }
              >
                {t("Request a place")}
              </Button>
            ) : null}
            {open && mine?.status === "PENDING" && mine.kind === "INVITATION" ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button isDisabled={actions.busy} onPress={() => act(mine.id, "accept")}>
                  {t("Accept invitation")}
                </Button>
                <Button
                  variant="danger"
                  isDisabled={actions.busy}
                  onPress={() => act(mine.id, "decline")}
                >
                  {t("Decline invitation")}
                </Button>
              </View>
            ) : null}
            {open &&
            mine &&
            (mine.status === "CONFIRMED" ||
              (mine.status === "PENDING" && mine.kind === "REQUEST")) ? (
              <Button
                variant="danger"
                isDisabled={actions.busy}
                onPress={() => act(mine.id, "cancel")}
              >
                {t("Cancel booking")}
              </Button>
            ) : null}
            {!open ? (
              <Typography>{t("Bookings are closed. Results can still be recorded.")}</Typography>
            ) : null}
            {table.matchId ? (
              <Button onPress={() => router.push(`/match/${table.matchId}`)}>
                {table.status === "TERMINATED" ? t("View results") : t("Open table match")}
              </Button>
            ) : null}
            {admin && open ? (
              <Button onPress={() => setInvite(true)}>{t("Invite organization members")}</Button>
            ) : null}
            {event.role !== "visitor" && bookings.isPending ? (
              <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
            ) : null}
          </View>
        }
        ListFooterComponent={
          <View>
            {bookings.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
            ) : null}
            {bookings.isError ? (
              <Button onPress={() => void bookings.refetch()}>
                {t("Could not load bookings. Retry")}
              </Button>
            ) : null}
          </View>
        }
        renderItem={({ item: b }) => (
          <View className="bg-surface" style={{ padding: 12, borderRadius: 12, gap: 8 }}>
            <Typography>
              {b.username ?? t("Username unavailable")} ·{" "}
              {b.status === "CONFIRMED" ? t("Confirmed") : t("Pending")}
            </Typography>
            {admin && open ? (
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {b.status === "PENDING" && b.kind === "REQUEST" ? (
                  <>
                    <Button
                      isIconOnly
                      accessibilityLabel={t("Approve request")}
                      isDisabled={actions.busy}
                      onPress={() => act(b.id, "approve")}
                    >
                      <Check size={18} color={primaryIcon} />
                    </Button>
                    <Button
                      isIconOnly
                      accessibilityLabel={t("Reject request")}
                      variant="danger-soft"
                      isDisabled={actions.busy}
                      onPress={() => act(b.id, "reject")}
                    >
                      <X size={18} color={dangerIcon} />
                    </Button>
                  </>
                ) : null}
                <Button
                  isIconOnly
                  accessibilityLabel={t("Remove player")}
                  variant="danger-soft"
                  isDisabled={actions.busy}
                  onPress={() => act(b.id, "remove")}
                >
                  <Trash2 size={18} color={dangerIcon} />
                </Button>
              </View>
            ) : null}
          </View>
        )}
      />
      {confirm ? (
        <CommunityConfirm
          title={confirm.action === "remove" ? t("Remove player") : t("Cancel booking")}
          description={t(
            "This reservation will be removed. The player can request a place again before the deadline.",
          )}
          busy={actions.busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void actions.booking
              .mutateAsync({ ...confirm, eventId })
              .then(() => setConfirm(null))
              .catch(() => {})
          }
        />
      ) : null}
    </View>
  );
}
