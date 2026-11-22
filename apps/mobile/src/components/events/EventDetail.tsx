import { notificationItemId } from "@board-game-organizer/schemas";
import {
  canManageEvent,
  communityAccessDenied,
  eventAvailabilityVoteIsAllowed,
  eventDateWall,
  eventItemTargets,
  eventLocalToIso,
  eventOptionsRequireVote,
  hasOptionVoters,
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
import { useCallback, useRef, useState } from "react";
import { FlatList, type ScrollView, View } from "react-native";
import { HEADER_ICON_SIZE, headerButtonProps } from "@/components/common/layout/headerStyles";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { ExpandableGroupedRow } from "@/components/common/ui/ExpandableGroupedRow";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { RetainedTabPanel } from "@/components/common/ui/RetainedTabPanel";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
import { ScrollTargetContext } from "@/components/common/ui/ScrollTargetContext";
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
import { EventSectionHeader } from "./EventSectionHeader";
import { EventTableCard } from "./EventTableCard";
import { EventVoteButtons } from "./EventVoteButtons";
import { EventVoteLegend } from "./EventVoteLegend";
import { OptionVoteVoters } from "./OptionVoteVoters";
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
  const tablesScroll = useRef<ScrollView>(null);
  const resetTablesPresentation = useRef(tables.resetPresentation);
  resetTablesPresentation.current = tables.resetPresentation;
  const changeTab = useCallback((value: string) => {
    const activeScroll =
      tabRef.current === "tables" ? tablesScroll : tabRef.current === "details" ? scroll : null;
    activeScroll?.current?.scrollTo({ y: 0, animated: false });
    if (tabRef.current === "tables" && value !== "tables") resetTablesPresentation.current();
    setTab(value);
  }, []);
  const renderTable = useCallback(
    ({ item }: { item: (typeof tables.items)[number] }) => (
      <EventTableCard table={item} context="event" />
    ),
    [],
  );
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
  const voteDates =
    event.status === "PLANNING" &&
    event.groupType !== "PUBLIC" &&
    eventOptionsRequireVote(event.dates);
  const voteLocations =
    event.status === "PLANNING" &&
    event.groupType !== "PUBLIC" &&
    eventOptionsRequireVote(event.locations);
  const namedVotes =
    !q.isPlaceholderData &&
    !event.readOnly &&
    (event.canManage === true || event.myRegistrations.some((row) => row.status === "ACCEPTED"))
      ? event.voteVoters
      : undefined;
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
      <EventSectionHeader
        event={event}
        section="details"
        voteDates={voteDates}
        voteLocations={voteLocations}
      />
      <View style={{ gap: 8 }}>
        <NotificationItem itemId={notificationItemId(event.id, "overview")} />
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
      <View style={{ gap: 8 }}>
        <NotificationItem itemId={notificationItemId(event.id, "dates")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Typography className="font-semibold text-foreground">
              {event.groupType === "PUBLIC" ? t("Start Date and Time") : t("Dates and times")}
            </Typography>
            {voteDates ? <EventVoteLegend label={t("Dates and times")} /> : null}
          </View>
        </NotificationItem>
        <GroupedList>
          {event.dates
            .filter(
              (row) =>
                event.status === "PLANNING" ||
                !event.confirmed ||
                row.id === event.confirmed.dateId,
            )
            .map((row) => {
              const voters = voteDates ? namedVotes?.dates[row.id] : undefined;
              const label = eventDateWall(event, row).replace("T", " ");
              const schedule = (
                <View
                  key="schedule"
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <View style={{ flexShrink: 1 }}>
                    <DateTimeInfo
                      startsAt={eventLocalToIso(eventDateWall(event, row), event.timeZone)}
                      timeZone={event.timeZone}
                    />
                  </View>
                  <NotificationItem itemId={notificationItemId(event.id, "date", row.id)} />
                </View>
              );
              const voteAction =
                (voteDates && event.canVote) || voters ? (
                  <EventVoteButtons
                    key="vote"
                    label={label}
                    voters={voters}
                    readOnly={!event.canVote}
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
                ) : null;
              return hasOptionVoters(voters) ? (
                <ExpandableGroupedRow
                  key={row.id}
                  summary={schedule}
                  actions={voteAction}
                  disclosure={{
                    label: `${t("Vote summary")}: ${label}`,
                    content: <OptionVoteVoters label={label} voters={voters} />,
                  }}
                />
              ) : (
                <GroupedRow key={row.id}>
                  {schedule}
                  {voteAction}
                </GroupedRow>
              );
            })}
        </GroupedList>
      </View>
      <EventProposalSection event={event} kind="date" disabled={q.isPlaceholderData} />
      {event.endsAt ? (
        <View style={{ gap: 8 }}>
          <Typography className="font-semibold text-foreground">
            {t("End Date and Time")}
          </Typography>
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
          <Typography className="font-semibold text-foreground">
            {t("Registration Deadline Date and Time")}
          </Typography>
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Typography className="font-semibold text-foreground">{t("Locations")}</Typography>
          {voteLocations ? <EventVoteLegend label={t("Locations")} /> : null}
        </View>
      </NotificationItem>
      <GroupedList>
        {event.locations
          .filter(
            (row) =>
              event.status === "PLANNING" ||
              !event.confirmed ||
              row.id === event.confirmed.locationId,
          )
          .map((row) => {
            const voters = voteLocations ? namedVotes?.locations[row.id] : undefined;
            return (
              <LocationListRow
                key={row.id}
                titleAccessory={
                  <NotificationItem itemId={notificationItemId(event.id, "location", row.id)} />
                }
                name={row.name}
                address={row.address}
                disclosure={
                  hasOptionVoters(voters)
                    ? {
                        label: `${t("Vote summary")}: ${row.name}`,
                        content: <OptionVoteVoters label={row.name} voters={voters} />,
                      }
                    : undefined
                }
                actions={
                  (voteLocations && event.canVote) || voters ? (
                    <EventVoteButtons
                      voters={voters}
                      readOnly={!event.canVote}
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
                      onChange={(vote) =>
                        a.vote.mutate({ kind: "location", optionId: row.id, vote })
                      }
                    />
                  ) : undefined
                }
              />
            );
          })}
      </GroupedList>
      <EventProposalSection event={event} kind="location" disabled={q.isPlaceholderData} />
      {event.groupId && fromGroup !== event.groupId ? (
        <EventGroupLink groupId={event.groupId} name={event.groupName} />
      ) : null}
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
      <Tabs value={tab} onValueChange={changeTab}>
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
  const participantsHeader = (
    <View style={{ gap: 12 }}>
      {detailHeader}
      <EventSectionHeader event={event} section="participants" />
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
      <View style={{ flex: 1 }}>
        {screenHeader}
        {(["details", "participants", "tables"] as const)
          .filter(
            (panel) =>
              panel !== "participants" || (!event.sharedResultsOnly && !event.personalAccessOnly),
          )
          .map((panel) => (
            <RetainedTabPanel
              key={JSON.stringify([o.apiUrl, o.userId, event.id, panel])}
              active={tab === panel}
            >
              {panel === "participants" ? (
                event.readOnly ? (
                  <ScreenScrollView hasFloatingActions={hasFloatingActions}>
                    {participantsHeader}
                    <Typography className="text-muted">
                      {t("Public event. Group membership is not required to participate.")}
                    </Typography>
                  </ScreenScrollView>
                ) : (
                  <EventParticipants
                    event={event}
                    actions={a}
                    disabled={q.isPlaceholderData}
                    header={participantsHeader}
                    hasFloatingActions={hasFloatingActions}
                  />
                )
              ) : (
                <ScrollTargetContext.Provider value={panel === "tables" ? tablesScroll : scroll}>
                  <FlatList
                    initialNumToRender={8}
                    maxToRenderPerBatch={6}
                    windowSize={7}
                    key={eventId}
                    ref={(node) => {
                      const target = panel === "tables" ? tablesScroll : scroll;
                      target.current = node?.getNativeScrollRef() as ScrollView | null;
                    }}
                    data={
                      panel === "tables" && !communityAccessDenied(tables.error) ? tables.items : []
                    }
                    keyExtractor={(row) => row.id}
                    contentContainerStyle={{
                      padding: 20,
                      paddingTop: 12,
                      gap: 12,
                      paddingBottom: layout.paddingBottom,
                    }}
                    ListHeaderComponent={
                      <View style={{ gap: 12 }}>
                        <View>{detailHeader}</View>
                        {panel === "details" ? (
                          header
                        ) : (
                          <>
                            <EventSectionHeader event={event} section="tables" />
                            <NotificationItem itemId={notificationItemId(event.id, "tables")} />
                          </>
                        )}
                      </View>
                    }
                    ListEmptyComponent={
                      panel === "tables" && !tables.isPending && !tables.isError ? (
                        <EmptyList icon={<Dices size={28} color={muted} />}>
                          {t("No tables found")}
                        </EmptyList>
                      ) : null
                    }
                    renderItem={renderTable}
                    onEndReached={() => {
                      if (
                        panel === "tables" &&
                        tabRef.current === "tables" &&
                        tables.hasNextPage &&
                        !tables.isFetching &&
                        !tables.isFetchNextPageError
                      )
                        void tables.fetchNextPage();
                    }}
                    ListFooterComponent={
                      panel === "tables" ? (
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
                </ScrollTargetContext.Provider>
              )}
            </RetainedTabPanel>
          ))}
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
    </NotificationAttentionScope>
  );
}
