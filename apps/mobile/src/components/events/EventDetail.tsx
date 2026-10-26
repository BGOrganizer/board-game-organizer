import {
  communityAccessDenied,
  eventAvailabilityVoteIsAllowed,
  eventDateWall,
  eventLocalToIso,
  useEventCutoff,
  useEventRecord,
  useEventRecordActions,
  useRecordTables,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  CalendarCheck,
  Check,
  ClipboardPenLine,
  Dices,
  Pencil,
  RotateCcw,
} from "lucide-react-native";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDetailsCard } from "./EventDetailsCard";
import { EventTableSummaryCard } from "./EventTableSummaryCard";
import { EventVoteButtons } from "./EventVoteButtons";
import { EventVoteCounts } from "./EventVoteCounts";
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
  const [accentForeground, muted, foreground] = useThemeColor([
    "accent-foreground",
    "muted",
    "foreground",
  ]);
  const confirmationBlocked =
    a.busy || q.isPlaceholderData || !event?.canConfirm || event?.agreement?.agreed !== true;
  const confirmationHint = a.busy
    ? t("An event action is in progress.")
    : q.isPlaceholderData
      ? t("Event details are still loading.")
      : t(
          "No complete agreement yet. Check participation and votes for the date, location and game.",
        );
  const screenHeader = (
    <Stack.Screen
      options={{
        title: event?.name ?? t("Event details"),
        headerRight: () =>
          event?.adminUserId === o.userId && event?.status === "PLANNING" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {confirmationBlocked ? (
                <HelpPopover
                  label={t("Why confirmation is unavailable")}
                  title={t("Confirm event")}
                >
                  <Typography className="text-foreground">{confirmationHint}</Typography>
                  {event.agreement?.reasons.map((reason) => (
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
                </HelpPopover>
              ) : null}
              <Button
                isIconOnly
                variant="primary"
                size="sm"
                style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
                hitSlop={4}
                accessibilityLabel={t("Confirm event")}
                isDisabled={confirmationBlocked}
                onPress={() => {
                  setError(false);
                  setConfirm("confirm");
                }}
              >
                <Check size={16} color={accentForeground} />
              </Button>
            </View>
          ) : event?.adminUserId === o.userId &&
            event?.status === "CONFIRMED" &&
            event.canFinalize ? (
            <Button
              isIconOnly
              variant="primary"
              size="sm"
              style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
              hitSlop={4}
              accessibilityLabel={t("Register results")}
              isDisabled={a.busy || q.isPlaceholderData}
              onPress={() =>
                router.push({ pathname: "/event/results", params: { eventId: event.id } })
              }
            >
              <ClipboardPenLine size={16} color={accentForeground} accessible={false} />
            </Button>
          ) : null,
      }}
    />
  );
  if (!event)
    return (
      <View style={{ padding: 20 }}>
        {screenHeader}
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
    if (
      a.busy ||
      q.isPlaceholderData ||
      event.adminUserId !== o.userId ||
      (confirm === "confirm" && confirmationBlocked) ||
      (confirm === "replan" && !event.canReplan)
    ) {
      setError(true);
      return;
    }
    setError(false);
    try {
      await a.transition.mutateAsync({ action: confirm, version: event.version });
      setConfirm(null);
    } catch {
      setError(true);
    }
  };
  const header = (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 8 }}>
        <EventDetailsCard event={event} />
      </View>
      <View style={{ gap: 8 }}>
        <SearchHelpLabel
          label={event.groupType === "PUBLIC" ? t("Start Date and Time") : t("Date and time")}
          helpTitle={t("Field help")}
          help={t("Times are local to the location chosen for the event.")}
        />
        <GroupedList>
          {event.dates
            .filter(
              (row) =>
                event.status === "PLANNING" ||
                !event.confirmed ||
                row.id === event.confirmed.dateId,
            )
            .map((row) => (
              <GroupedRow key={row.id}>
                <View style={{ flex: 1, gap: 8 }}>
                  <DateTimeInfo
                    startsAt={eventLocalToIso(eventDateWall(event, row), event.timeZone)}
                    timeZone={event.timeZone}
                  />
                  {event.groupType !== "PUBLIC" ? (
                    <EventVoteCounts
                      label={eventDateWall(event, row).replace("T", " ")}
                      counts={event.voteCounts?.dates[row.id]}
                    />
                  ) : null}
                </View>
                {event.groupType !== "PUBLIC" && event.canVote && !closed ? (
                  <EventVoteButtons
                    allowUnknown={false}
                    label={eventDateWall(event, row).replace("T", " ")}
                    value={event.myVotes?.dateVotes[row.id]}
                    disabledVotes={
                      eventAvailabilityVoteIsAllowed(
                        event.dates,
                        event.myVotes?.dateVotes ?? {},
                        row.id,
                        "NO",
                      )
                        ? []
                        : ["NO"]
                    }
                    busy={a.busy || q.isPlaceholderData}
                    onChange={(vote) => {
                      if (vote !== "UNKNOWN")
                        a.vote.mutate({ kind: "date", optionId: row.id, vote });
                    }}
                  />
                ) : null}
              </GroupedRow>
            ))}
        </GroupedList>
      </View>
      {event.endsAt ? (
        <View style={{ gap: 8 }}>
          <SearchHelpLabel
            label={t("End Date and Time")}
            helpTitle={t("Field help")}
            help={t(
              "Choose a later time on the same day as the event start. All public tables must finish by this time.",
            )}
          />
          <GroupedList>
            <GroupedRow>
              <DateTimeInfo
                startsAt={event.endsAt}
                timeZone={event.timeZone}
                timeLabel={t("End time")}
              />
            </GroupedRow>
          </GroupedList>
        </View>
      ) : null}
      {event.bookingClosesAt ? (
        <View style={{ gap: 8 }}>
          <SearchHelpLabel
            label={t("Booking Cutoff Date and Time")}
            helpTitle={t("Field help")}
            help={t(
              "Registration closes at this local date and time, before the event starts. A new event needs a future cutoff.",
            )}
          />
          <GroupedList>
            <GroupedRow>
              <DateTimeInfo
                startsAt={event.bookingClosesAt}
                timeZone={event.timeZone}
                timeLabel={t("Booking cutoff")}
              />
            </GroupedRow>
          </GroupedList>
        </View>
      ) : null}
      <Typography className="font-semibold text-foreground">{t("Locations")}</Typography>
      <GroupedList>
        {event.locations
          .filter(
            (row) =>
              event.status === "PLANNING" ||
              !event.confirmed ||
              row.id === event.confirmed.locationId,
          )
          .map((row) => (
            <LocationListRow
              key={row.id}
              name={row.name}
              address={row.address}
              actions={
                event.groupType !== "PUBLIC" && event.canVote && !closed ? (
                  <EventVoteButtons
                    allowUnknown={false}
                    label={row.name}
                    value={event.myVotes?.locationVotes[row.id]}
                    disabledVotes={
                      eventAvailabilityVoteIsAllowed(
                        event.locations,
                        event.myVotes?.locationVotes ?? {},
                        row.id,
                        "NO",
                      )
                        ? []
                        : ["NO"]
                    }
                    busy={a.busy || q.isPlaceholderData}
                    onChange={(vote) => {
                      if (vote !== "UNKNOWN")
                        a.vote.mutate({ kind: "location", optionId: row.id, vote });
                    }}
                  />
                ) : undefined
              }
            >
              {event.groupType !== "PUBLIC" ? (
                <EventVoteCounts label={row.name} counts={event.voteCounts?.locations[row.id]} />
              ) : null}
            </LocationListRow>
          ))}
      </GroupedList>
      <Typography className="font-semibold text-foreground">{t("Tables")}</Typography>
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      {screenHeader}
      <FlatList
        data={tables.items}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: insets.bottom + 112 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !tables.isPending && !tables.isError ? (
            <EmptyList icon={<Dices size={28} color={muted} />}>{t("No tables found")}</EmptyList>
          ) : null
        }
        renderItem={({ item }) => <EventTableSummaryCard table={item} />}
        onEndReached={() => {
          if (tables.hasNextPage && !tables.isFetchingNextPage && !tables.isFetchNextPageError)
            void tables.fetchNextPage();
        }}
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {tables.isPending || tables.isFetchingNextPage ? (
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
      {event.adminUserId === o.userId && event.status === "CONFIRMED" && event.canReplan ? (
        <FloatingActions
          label={t("Reopen planning")}
          variant="secondary"
          isDisabled={a.busy || q.isPlaceholderData}
          onPress={() => {
            setError(false);
            setConfirm("replan");
          }}
        >
          <RotateCcw size={20} color={foreground} accessible={false} />
        </FloatingActions>
      ) : null}
      {event.status === "PLANNING" && event.canEdit && !closed ? (
        <FloatingActions
          label="Edit event"
          isDisabled={a.busy || q.isPlaceholderData}
          onPress={() => router.push({ pathname: "/event/wizard", params: { eventId: event.id } })}
        >
          <Pencil size={20} color={accentForeground} />
        </FloatingActions>
      ) : null}
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
          actions={[
            {
              label: t("Confirm"),
              variant: "primary",
              icon:
                confirm === "confirm" ? (
                  <CalendarCheck size={16} color={accentForeground} accessible={false} />
                ) : (
                  <RotateCcw size={16} color={accentForeground} accessible={false} />
                ),
              onPress: () => void transition(),
            },
          ]}
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
