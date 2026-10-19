import {
  communityAccessDenied,
  useEventCutoff,
  useEventRecord,
  useEventRecordActions,
  useRecordTables,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableCard } from "./EventTableCard";
import { EventVoteButtons } from "./EventVoteButtons";
import { EventVoteLegend } from "./EventVoteLegend";
export function EventDetail({ eventId }: { eventId: string }) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    q = useEventRecord(o, eventId),
    a = useEventRecordActions(o, eventId),
    tables = useRecordTables(o, eventId),
    [confirm, setConfirm] = useState<"confirm" | "replan" | null>(null),
    [error, setError] = useState(false),
    event = communityAccessDenied(q.error) ? undefined : q.data;
  const closed = useEventCutoff(event?.bookingClosesAt, event?.groupType === "PUBLIC");
  if (!event)
    return (
      <View style={{ padding: 20 }}>
        {q.isPending ? (
          <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
        ) : (
          <>
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not load event")}
            </Typography>
            <Button onPress={() => void q.refetch()}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </>
        )}
      </View>
    );
  const transition = async () => {
    if (!confirm) return;
    setError(false);
    try {
      await a.transition.mutateAsync({ action: confirm, version: event.version });
      setConfirm(null);
    } catch {
      setError(true);
    }
  };
  const header = (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Typography className="font-semibold text-foreground" style={{ flex: 1 }}>
          {event.name}
        </Typography>
        <EventVoteLegend />
      </View>
      <Typography className="text-foreground">
        {event.status === "PLANNING"
          ? t("Planning")
          : event.status === "CONFIRMED"
            ? t("Confirmed")
            : t("Terminated")}{" "}
        · {event.startTime} ({event.timeZone})
      </Typography>
      {event.groupName ? (
        <Button
          variant="ghost"
          onPress={() =>
            router.push({ pathname: "/group/[groupId]", params: { groupId: event.groupId! } })
          }
        >
          <Button.Label>{event.groupName}</Button.Label>
        </Button>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {event.canEdit && !closed ? (
          <Button
            variant="outline"
            onPress={() =>
              router.push({ pathname: "/event/wizard", params: { eventId: event.id } })
            }
          >
            <Button.Label>{t("Edit event")}</Button.Label>
          </Button>
        ) : null}
        {event.canConfirm ? (
          <Button isDisabled={a.busy || q.isPlaceholderData} onPress={() => setConfirm("confirm")}>
            <Button.Label>{t("Confirm event")}</Button.Label>
          </Button>
        ) : null}
        {event.canReplan ? (
          <Button variant="secondary" isDisabled={a.busy} onPress={() => setConfirm("replan")}>
            <Button.Label>{t("Reopen planning")}</Button.Label>
          </Button>
        ) : null}
        {event.canFinalize ? (
          <Button
            onPress={() =>
              router.push({ pathname: "/event/results", params: { eventId: event.id } })
            }
          >
            <Button.Label>{t("Register results")}</Button.Label>
          </Button>
        ) : null}
      </View>
      <Typography className="font-semibold text-foreground">{t("Dates")}</Typography>
      {event.dates
        .filter((row) => !event.confirmed || row.id === event.confirmed.dateId)
        .map((row) => (
          <View key={row.id} style={{ gap: 8 }}>
            <Typography className="text-foreground">{row.day}</Typography>
            {event.canVote && !closed ? (
              <EventVoteButtons
                label={row.day}
                value={event.myVotes?.dateVotes[row.id]}
                busy={a.busy || q.isPlaceholderData}
                onChange={(vote) => a.vote.mutate({ kind: "date", optionId: row.id, vote })}
              />
            ) : null}
          </View>
        ))}
      <Typography className="font-semibold text-foreground">{t("Locations")}</Typography>
      {event.locations
        .filter((row) => !event.confirmed || row.id === event.confirmed.locationId)
        .map((row) => (
          <View key={row.id} style={{ gap: 8 }}>
            <LocationListRow name={row.name} address={row.address} />
            {event.canVote && !closed ? (
              <EventVoteButtons
                label={row.name}
                value={event.myVotes?.locationVotes[row.id]}
                busy={a.busy || q.isPlaceholderData}
                onChange={(vote) => a.vote.mutate({ kind: "location", optionId: row.id, vote })}
              />
            ) : null}
          </View>
        ))}
      {event.bookingClosesAt ? (
        <Typography className="text-foreground">
          {t("Booking cutoff")}: {event.bookingClosesAt} · {t("Event end")}: {event.endsAt}
        </Typography>
      ) : null}
      {event.agreement ? (
        <View style={{ gap: 8 }}>
          <Typography className="font-semibold text-foreground">{t("Agreement")}</Typography>
          <Typography className="text-foreground">
            {event.agreement.agreed
              ? t("Agreement available. Confirmation remains manual.")
              : t("No complete agreement yet.")}
          </Typography>
          {event.agreement.reasons.map((reason) => (
            <Typography key={reason.tableId} className="text-muted">
              {tables.items.find((row) => row.id === reason.tableId)?.name ?? t("Table")}:{" "}
              {reason.code === "PENDING_RESERVATIONS"
                ? t("Pending invitations still reserve places.")
                : reason.code === "GAME_DISAGREEMENT"
                  ? t(
                      "Seated players agree on date and location but not game. Change votes or edit the games; waiting players cannot replace them for this reason.",
                    )
                  : t("No compatible accepted players for this table.")}
            </Typography>
          ))}
        </View>
      ) : q.isPlaceholderData ? (
        <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
      ) : null}
      <Typography className="font-semibold text-foreground">{t("Tables")}</Typography>
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: event.name }} />
      <FlatList
        data={tables.items}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: insets.bottom + 32 }}
        ListHeaderComponent={header}
        renderItem={({ item }) => <EventTableCard table={item} />}
        onEndReached={() => {
          if (tables.hasNextPage && !tables.isFetchingNextPage && !tables.isFetchNextPageError)
            void tables.fetchNextPage();
        }}
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {tables.isPending ? (
              <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
            ) : null}
            {tables.isError ? (
              <>
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load tables")}
                </Typography>
                <Button onPress={() => void tables.refetch()}>
                  <Button.Label>{t("Try again")}</Button.Label>
                </Button>
              </>
            ) : null}
            {tables.hasNextPage ? (
              <Button
                isDisabled={tables.isFetchingNextPage}
                onPress={() => void tables.fetchNextPage()}
              >
                <Button.Label>{t("Load more")}</Button.Label>
              </Button>
            ) : null}
          </View>
        }
      />
      {confirm ? (
        <ConfirmDialog
          title={confirm === "confirm" ? t("Confirm event") : t("Reopen planning")}
          description={
            confirm === "confirm"
              ? t(
                  "Only agreed tables and accepted players are frozen. Other tables and invitations are retained but excluded.",
                )
              : t(
                  "Votes, invitations and waiting priorities are retained. The booking cutoff is not extended.",
                )
          }
          busy={a.busy}
          onCancel={() => setConfirm(null)}
          actions={[{ label: t("Confirm"), variant: "primary", onPress: () => void transition() }]}
        >
          {error ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not change event state. Refresh and try again.")}
            </Typography>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </View>
  );
}
