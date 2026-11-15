import { notificationItemId } from "@board-game-organizer/schemas";
import {
  canManageEvent,
  communityAccessDenied,
  eventAvailabilityVoteIsAllowed,
  eventDateWall,
  eventItemTargets,
  eventLocalToIso,
  eventOptionsRequireVote,
  useEventRecord,
  useEventRecordActions,
  useNotificationChanges,
  useRecordTables,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import {
  CalendarCheck,
  Check,
  Dices,
  Info,
  Pencil,
  RotateCcw,
  UsersRound,
} from "lucide-react-native";
import { useRef, useState } from "react";
import { FlatList, type ScrollView, View } from "react-native";
import { HEADER_ICON_SIZE, headerButtonProps } from "@/components/common/layout/headerStyles";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
import { ScrollTargetContext } from "@/components/common/ui/ScrollTargetContext";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationChangesPopover } from "@/components/notifications/NotificationChangesPopover";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";
import { EventDeleteAction } from "./EventDeleteAction";
import { EventDetailsCard } from "./EventDetailsCard";
import { EventFinalizeAction } from "./EventFinalizeAction";
import { EventGroupLink } from "./EventGroupLink";
import { EventParticipants } from "./EventParticipants";
import { EventProposalSection } from "./EventProposalSection";
import { EventTableCard } from "./EventTableCard";
import { EventVoteButtons } from "./EventVoteButtons";
import { EventVoteCounts } from "./EventVoteCounts";
import { EventVoteLegend } from "./EventVoteLegend";
import { TableListHeading } from "./TableListHeading";
export function EventDetail({ eventId, fromGroup }: { eventId: string; fromGroup?: string }) {
  const { i18n } = useLingui();
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    q = useEventRecord(o, eventId),
    a = useEventRecordActions(o, eventId),
    tables = useRecordTables(o, eventId),
    [confirm, setConfirm] = useState<"confirm" | "replan" | null>(null),
    [error, setError] = useState(false),
    event = communityAccessDenied(q.error) ? undefined : q.data;
  const [requestedTab, setTab] = useState("details");
  const transitionVersion = useRef<number | null>(null);
  const tab =
    (event?.sharedResultsOnly || event?.personalAccessOnly) && requestedTab === "participants"
      ? "details"
      : requestedTab;
  const hasFloatingActions = Boolean(
    event &&
      ((canManageEvent(event, o.userId) && event.status === "CONFIRMED" && event.canReplan) ||
        (tab === "details" && event.status === "PLANNING" && event.canEdit)),
  );
  const layout = useFloatingActionLayout(hasFloatingActions);
  const changes = useNotificationChanges(
    {
      ...o,
      locale: i18n.locale.startsWith("it") ? "it" : "en",
      enabled:
        o.enabled !== false &&
        Boolean(event) &&
        !event?.readOnly &&
        !event?.personalAccessOnly &&
        !event?.sharedResultsOnly,
    },
    {
      kind: "event",
      id: eventId,
      tab: "all",
    },
  );
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const scroll = useRef<ScrollView>(null);
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
          !event?.readOnly && canManageEvent(event, o.userId) && event?.status === "PLANNING" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {confirmationBlocked ? (
                <HelpPopover
                  label={t("Confirm event")}
                  title={t("Confirm event")}
                  icon={Check}
                  triggerVariant="primary"
                  triggerClassName="opacity-60"
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
              ) : (
                <Button
                  {...headerButtonProps}
                  variant="primary"
                  hitSlop={4}
                  accessibilityLabel={t("Confirm event")}
                  onPress={() => {
                    setError(false);
                    transitionVersion.current = event.version;
                    setConfirm("confirm");
                  }}
                >
                  <Check size={HEADER_ICON_SIZE} color={accentForeground} />
                </Button>
              )}
              <EventDeleteAction event={event} disabled={q.isPlaceholderData} />
            </View>
          ) : !event?.readOnly &&
            canManageEvent(event, o.userId) &&
            event?.status === "CONFIRMED" ? (
            <EventFinalizeAction event={event} disabled={q.isPlaceholderData} />
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
  const voteDates = event.groupType !== "PUBLIC" && eventOptionsRequireVote(event.dates);
  const voteLocations = event.groupType !== "PUBLIC" && eventOptionsRequireVote(event.locations);
  const transition = () => {
    if (!confirm) return;
    if (
      a.busy ||
      q.isPlaceholderData ||
      transitionVersion.current !== event.version ||
      !canManageEvent(event, o.userId) ||
      (confirm === "confirm" && confirmationBlocked) ||
      (confirm === "replan" && !event.canReplan)
    ) {
      setError(true);
      return;
    }
    setError(false);
    a.transition.mutate({ action: confirm, version: transitionVersion.current });
    setConfirm(null);
  };
  const header = (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 8 }}>
        <NotificationItem itemId={notificationItemId(event.id, "overview")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Typography className="font-semibold text-foreground">{t("Details")}</Typography>
            <EventVoteLegend />
          </View>
        </NotificationItem>
        {event.readOnly ? (
          <Typography className="text-sm text-muted">
            {event.personalAccessOnly
              ? t("Personal access to your table. Group details are hidden.")
              : event.sharedResultsOnly
                ? t("Shared finalized results. Group details are hidden.")
                : t("Public event. Group membership is not required to participate.")}
          </Typography>
        ) : null}
      </View>
      {event.groupId && fromGroup !== event.groupId ? (
        <EventGroupLink groupId={event.groupId} name={event.groupName} />
      ) : null}
      <View style={{ gap: 8 }}>
        <NotificationItem itemId={notificationItemId(event.id, "dates")}>
          <SearchHelpLabel
            label={event.groupType === "PUBLIC" ? t("Start Date and Time") : t("Date and time")}
            helpTitle={t("Field help")}
            help={t("Times are local to the location chosen for the event.")}
          />
        </NotificationItem>
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
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ flexShrink: 1 }}>
                      <DateTimeInfo
                        startsAt={eventLocalToIso(eventDateWall(event, row), event.timeZone)}
                        timeZone={event.timeZone}
                      />
                    </View>
                    <NotificationItem itemId={notificationItemId(event.id, "date", row.id)} />
                  </View>
                  {voteDates ? (
                    <EventVoteCounts
                      label={eventDateWall(event, row).replace("T", " ")}
                      counts={event.voteCounts?.dates[row.id]}
                    />
                  ) : null}
                </View>
                {voteDates && event.canVote ? (
                  <EventVoteButtons
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
                    busy={a.blocking || q.isPlaceholderData}
                    onChange={(vote) => a.vote.mutate({ kind: "date", optionId: row.id, vote })}
                  />
                ) : null}
              </GroupedRow>
            ))}
        </GroupedList>
      </View>
      <EventProposalSection event={event} kind="date" disabled={q.isPlaceholderData} />
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
            label={t("Registration Deadline Date and Time")}
            helpTitle={t("Field help")}
            help={t(
              "Registration closes on a day before the event starts. A new event needs a future deadline.",
            )}
          />
          <GroupedList>
            <GroupedRow>
              <DateTimeInfo
                startsAt={event.bookingClosesAt}
                timeZone={event.timeZone}
                timeLabel={t("Registration Deadline Date and Time")}
              />
            </GroupedRow>
          </GroupedList>
        </View>
      ) : null}
      <NotificationItem itemId={notificationItemId(event.id, "locations")}>
        <Typography className="font-semibold text-foreground">{t("Locations")}</Typography>
      </NotificationItem>
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
              titleAccessory={
                <NotificationItem itemId={notificationItemId(event.id, "location", row.id)} />
              }
              name={row.name}
              address={row.address}
              actions={
                voteLocations && event.canVote ? (
                  <EventVoteButtons
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
                    busy={a.blocking || q.isPlaceholderData}
                    onChange={(vote) => a.vote.mutate({ kind: "location", optionId: row.id, vote })}
                  />
                ) : undefined
              }
            >
              {voteLocations ? (
                <EventVoteCounts label={row.name} counts={event.voteCounts?.locations[row.id]} />
              ) : null}
            </LocationListRow>
          ))}
      </GroupedList>
      <EventProposalSection event={event} kind="location" disabled={q.isPlaceholderData} />
    </View>
  );
  const detailHeader = (
    <View style={{ gap: 12 }}>
      <EventDetailsCard
        event={event}
        titleAction={
          !event.readOnly && !event.personalAccessOnly && !event.sharedResultsOnly ? (
            <NotificationChangesPopover model={changes} />
          ) : undefined
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <View>
          <TabBar>
            <TabTrigger icon={Info} value="details" style={{ flexDirection: "row", gap: 6 }}>
              <Tabs.Label>{t("Details")}</Tabs.Label>
              <NotificationTabBadge
                target={{ kind: "event", id: eventId }}
                count={changes.tabCounts.details}
              />
            </TabTrigger>
            {!event.sharedResultsOnly && !event.personalAccessOnly ? (
              <TabTrigger
                icon={UsersRound}
                value="participants"
                style={{ flexDirection: "row", gap: 6 }}
              >
                <Tabs.Label>{t("Participants")}</Tabs.Label>
                <NotificationTabBadge
                  target={{ kind: "event", id: eventId }}
                  count={changes.tabCounts.participants}
                />
              </TabTrigger>
            ) : null}
            <TabTrigger icon={Dices} value="tables" style={{ flexDirection: "row", gap: 6 }}>
              <Tabs.Label>{t("Tables")}</Tabs.Label>
              <NotificationTabBadge
                target={{ kind: "event", id: eventId }}
                count={changes.tabCounts.tables}
              />
            </TabTrigger>
          </TabBar>
        </View>
      </Tabs>
    </View>
  );
  return (
    <NotificationAttentionScope
      options={o}
      targets={
        event.readOnly
          ? []
          : [
              { kind: "event", id: event.id },
              ...eventItemTargets(event),
              ...(communityAccessDenied(tables.error) ? [] : tables.items).map((row) => ({
                kind: "table" as const,
                id: row.id,
              })),
            ]
      }
    >
      <ScrollTargetContext.Provider value={scroll}>
        <View style={{ flex: 1 }}>
          {screenHeader}
          {tab === "participants" ? (
            event.readOnly ? (
              <ScreenScrollView hasFloatingActions={hasFloatingActions}>
                {detailHeader}
                <Typography className="text-muted">
                  {t("Public event. Group membership is not required to participate.")}
                </Typography>
              </ScreenScrollView>
            ) : (
              <EventParticipants
                event={event}
                actions={a}
                disabled={q.isPlaceholderData}
                header={detailHeader}
                hasFloatingActions={hasFloatingActions}
              />
            )
          ) : (
            <FlatList
              key={tab}
              ref={(node) => {
                scroll.current = node?.getNativeScrollRef() as ScrollView | null;
              }}
              data={tab === "tables" && !communityAccessDenied(tables.error) ? tables.items : []}
              keyExtractor={(row) => row.id}
              contentContainerStyle={{
                padding: 20,
                paddingTop: 12,
                gap: 12,
                paddingBottom: layout.paddingBottom,
              }}
              ListHeaderComponent={
                <View style={{ gap: 12 }}>
                  {detailHeader}
                  {tab === "details" ? (
                    header
                  ) : (
                    <NotificationItem itemId={notificationItemId(event.id, "tables")}>
                      <TableListHeading />
                    </NotificationItem>
                  )}
                </View>
              }
              ListEmptyComponent={
                tab === "tables" && !tables.isPending && !tables.isError ? (
                  <EmptyList icon={<Dices size={28} color={muted} />}>
                    {t("No tables found")}
                  </EmptyList>
                ) : null
              }
              renderItem={({ item }) => <EventTableCard table={item} context="event" />}
              onEndReached={() => {
                if (
                  tabRef.current === "tables" &&
                  tables.hasNextPage &&
                  !tables.isFetching &&
                  !tables.isFetchNextPageError
                )
                  void tables.fetchNextPage();
              }}
              ListFooterComponent={
                tab === "tables" ? (
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
                ) : null
              }
            />
          )}
          {canManageEvent(event, o.userId) && event.status === "CONFIRMED" && event.canReplan ? (
            <FloatingActions
              label={t("Reopen planning")}
              variant="secondary"
              isDisabled={a.busy || q.isPlaceholderData}
              onPress={() => {
                setError(false);
                transitionVersion.current = event.version;
                setConfirm("replan");
              }}
            >
              <RotateCcw size={20} color={foreground} accessible={false} />
            </FloatingActions>
          ) : null}
          {tab === "details" && event.status === "PLANNING" && event.canEdit ? (
            <FloatingActions
              label={t("Edit event")}
              isDisabled={a.busy || q.isPlaceholderData}
              onPress={() =>
                router.push({
                  pathname: "/event/wizard",
                  params: {
                    eventId: event.id,
                    ...(fromGroup === event.groupId ? { fromGroup } : {}),
                  },
                })
              }
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
                      "Votes, invitations and waiting priorities are retained. The booking cutoff is not extended. Confirming again discards saved provisional scores.",
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
      </ScrollTargetContext.Provider>
    </NotificationAttentionScope>
  );
}
