import {
  type BookingAction,
  communityAccessDenied,
  useEvent,
  useEventActions,
  useEventBookings,
  useEventTable,
  useEventWindow,
  useOrganizationMembers,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";

import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Check, Trash2, X } from "lucide-react-native";
import { useState } from "react";
import { FlatList, View } from "react-native";

import { CommunityConfirm } from "@/components/common/ui/CommunityConfirm";

import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

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
