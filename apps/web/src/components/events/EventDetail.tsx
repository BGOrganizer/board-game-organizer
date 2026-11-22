"use client";
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
import { Button, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  ArrowLeft,
  CalendarCheck,
  Check,
  Dices,
  Info,
  Pencil,
  RotateCcw,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { floatingActionContentStyle } from "@/components/common/layout/floatingActionStyles";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import {
  HEADER_ICON_CLASS,
  headerButtonProps,
  headerControlClassName,
} from "@/components/common/layout/headerStyles";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationChangesPopover } from "@/components/notifications/NotificationChangesPopover";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useCommunityApi } from "@/lib/useCommunityApi";

import { EventDeleteAction } from "./EventDeleteAction";
import { EventDetailsCard } from "./EventDetailsCard";
import { EventFinalizeAction } from "./EventFinalizeAction";
import { EventGroupLink } from "./EventGroupLink";
import { EventParticipants } from "./EventParticipants";
import { EventProposalSection } from "./EventProposalSection";
import { EventSectionHeader } from "./EventSectionHeader";
import { EventTables } from "./EventTables";
import { EventVoteButtons } from "./EventVoteButtons";
import { EventVoteLegend } from "./EventVoteLegend";
import { OptionVoteVoters } from "./OptionVoteVoters";
export function EventDetail({ eventId, fromGroup }: { eventId: string; fromGroup?: string }) {
  const { t, i18n } = useLingui(),
    o = useCommunityApi(),
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
  const confirmationBlocked =
    a.busy || q.isPlaceholderData || !event?.canConfirm || event?.agreement?.agreed !== true;
  const confirmationHint = a.busy
    ? t`An event action is in progress.`
    : q.isPlaceholderData
      ? t`Event details are still loading.`
      : t`No complete agreement yet. Check participation and votes for the date, location and game.`;
  const back = (
    <Link
      href={event && fromGroup === event.groupId ? `/groups/${event.groupId}` : "/events"}
      aria-label={t`Back`}
      className={headerControlClassName}
    >
      <ArrowLeft className={HEADER_ICON_CLASS} aria-hidden />
    </Link>
  );
  if (!event)
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <HeaderActions back={back} />
        {q.isPending ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <div role="alert">
            <p className="text-danger">{t`Could not load event`}</p>
            <Button onPress={() => void q.refetch()}>{t`Try again`}</Button>
          </div>
        )}
      </div>
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
  const hasFloatingActions =
    (canManageEvent(event, o.userId) && event.status === "CONFIRMED" && event.canReplan) ||
    (tab === "details" && event.status === "PLANNING" && event.canEdit);
  const transition = (action: "confirm" | "replan") => {
    if (
      a.busy ||
      q.isPlaceholderData ||
      transitionVersion.current !== event.version ||
      !canManageEvent(event, o.userId) ||
      (action === "confirm" && confirmationBlocked) ||
      (action === "replan" && !event.canReplan)
    ) {
      setError(true);
      return;
    }
    setError(false);
    a.transition.mutate({ action, version: transitionVersion.current });
    setConfirm(null);
  };
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
      <div
        className="mx-auto max-w-4xl space-y-4"
        style={hasFloatingActions ? floatingActionContentStyle : undefined}
      >
        <HeaderActions back={back}>
          {!event.readOnly && canManageEvent(event, o.userId) && event.status === "PLANNING" ? (
            <div className="flex items-center gap-1">
              {confirmationBlocked ? (
                <HelpPopover
                  label={t`Confirm event`}
                  title={t`Confirm event`}
                  icon={Check}
                  triggerVariant="primary"
                  triggerClassName="opacity-60"
                >
                  <div className="space-y-2">
                    <p>{confirmationHint}</p>
                    {event.agreement?.reasons.map((reason) => (
                      <p key={reason.tableId}>
                        {tables.items.find((row) => row.id === reason.tableId)?.name ?? t`Table`}:{" "}
                        {reason.code === "PENDING_RESERVATIONS"
                          ? t`Pending invitations still reserve places.`
                          : reason.code === "GAME_DISAGREEMENT"
                            ? t`Seated players agree on date and location but not game. Change votes or edit the games; waiting players cannot replace them for this reason.`
                            : t`No compatible accepted players for this table.`}
                      </p>
                    ))}
                  </div>
                </HelpPopover>
              ) : (
                <Button
                  {...headerButtonProps}
                  variant="primary"
                  aria-label={t`Confirm event`}
                  onPress={() => {
                    setError(false);
                    transitionVersion.current = event.version;
                    setConfirm("confirm");
                  }}
                >
                  <Check className={HEADER_ICON_CLASS} aria-hidden />
                </Button>
              )}
              <EventDeleteAction event={event} disabled={q.isPlaceholderData} />
            </div>
          ) : null}
          {!event.readOnly && canManageEvent(event, o.userId) && event.status === "CONFIRMED" ? (
            <EventFinalizeAction event={event} disabled={q.isPlaceholderData} />
          ) : null}
        </HeaderActions>
        <EventDetailsCard
          event={event}
          titleAction={
            !event.readOnly && !event.personalAccessOnly && !event.sharedResultsOnly ? (
              <NotificationChangesPopover model={changes} />
            ) : undefined
          }
        />
        <Tabs
          selectedKey={tab}
          onSelectionChange={(value) => setTab(String(value))}
          className="flex flex-col"
        >
          <TabBar label={t`Event details`}>
            <TabTrigger icon={Info} id="details">
              {t`Details`}
              <NotificationTabBadge
                target={{ kind: "event", id: eventId }}
                count={changes.tabCounts.details}
              />
            </TabTrigger>
            {!event.sharedResultsOnly && !event.personalAccessOnly ? (
              <TabTrigger icon={UsersRound} id="participants">
                {t`Participants`}
                <NotificationTabBadge
                  target={{ kind: "event", id: eventId }}
                  count={changes.tabCounts.participants}
                />
              </TabTrigger>
            ) : null}
            <TabTrigger icon={Dices} id="tables">
              {t`Tables`}
              <NotificationTabBadge
                target={{ kind: "event", id: eventId }}
                count={changes.tabCounts.tables}
              />
            </TabTrigger>
          </TabBar>
        </Tabs>

        {tab === "details" ? (
          <>
            <EventSectionHeader
              event={event}
              section="details"
              voteDates={voteDates}
              voteLocations={voteLocations}
            />
            <NotificationItem itemId={notificationItemId(event.id, "overview")} />
            {event.readOnly ? (
              <p className="text-sm text-muted">
                {event.personalAccessOnly
                  ? t`Personal access to your table. Group details are hidden.`
                  : event.sharedResultsOnly
                    ? t`Shared finalized results. Group details are hidden.`
                    : t`Public event. Group membership is not required to participate.`}
              </p>
            ) : null}
            <section
              aria-label={
                event.groupType === "PUBLIC" ? t`Start Date and Time` : t`Dates and times`
              }
              className="space-y-3"
            >
              <NotificationItem itemId={notificationItemId(event.id, "dates")}>
                <div className="flex items-center gap-1">
                  <h2 className="font-semibold">
                    {event.groupType === "PUBLIC" ? t`Start Date and Time` : t`Dates and times`}
                  </h2>
                  {voteDates ? <EventVoteLegend label={t`Dates and times`} /> : null}
                </div>
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
                    return (
                      <GroupedRow key={row.id} className="flex-wrap">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <DateTimeInfo
                              startsAt={eventLocalToIso(eventDateWall(event, row), event.timeZone)}
                              timeZone={event.timeZone}
                            />
                            <NotificationItem
                              itemId={notificationItemId(event.id, "date", row.id)}
                            />
                          </div>
                          {voters ? <OptionVoteVoters label={label} voters={voters} /> : null}
                        </div>
                        {(voteDates && event.canVote) || voters ? (
                          <EventVoteButtons
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
                            onChange={(vote) =>
                              a.vote.mutate({ kind: "date", optionId: row.id, vote })
                            }
                          />
                        ) : null}
                      </GroupedRow>
                    );
                  })}
              </GroupedList>
            </section>
            <EventProposalSection event={event} kind="date" disabled={q.isPlaceholderData} />
            {event.endsAt ? (
              <section aria-label={t`End Date and Time`} className="space-y-3">
                <h2 className="font-semibold">{t`End Date and Time`}</h2>
                <GroupedList>
                  <GroupedRow>
                    <DateTimeInfo
                      startsAt={event.endsAt}
                      timeZone={event.timeZone}
                      timeLabel={t`End time`}
                    />
                  </GroupedRow>
                </GroupedList>
              </section>
            ) : null}
            {event.bookingClosesAt ? (
              <section aria-label={t`Registration Deadline Date and Time`} className="space-y-3">
                <h2 className="font-semibold">{t`Registration Deadline Date and Time`}</h2>
                <GroupedList>
                  <GroupedRow>
                    <DateTimeInfo
                      startsAt={event.bookingClosesAt}
                      timeZone={event.timeZone}
                      timeLabel={t`Registration Deadline Date and Time`}
                    />
                  </GroupedRow>
                </GroupedList>
              </section>
            ) : null}
            <section aria-label={t`Locations`} className="space-y-3">
              <NotificationItem itemId={notificationItemId(event.id, "locations")}>
                <div className="flex items-center gap-1">
                  <h2 className="font-semibold">{t`Locations`}</h2>
                  {voteLocations ? <EventVoteLegend label={t`Locations`} /> : null}
                </div>
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
                        name={row.name}
                        address={row.address}
                        titleAccessory={
                          <NotificationItem
                            itemId={notificationItemId(event.id, "location", row.id)}
                          />
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
                      >
                        {voters ? <OptionVoteVoters label={row.name} voters={voters} /> : null}
                      </LocationListRow>
                    );
                  })}
              </GroupedList>
              <EventProposalSection event={event} kind="location" disabled={q.isPlaceholderData} />
            </section>
            {event.groupId && fromGroup !== event.groupId ? (
              <EventGroupLink groupId={event.groupId} name={event.groupName} />
            ) : null}
          </>
        ) : null}
        {tab === "participants" ? (
          <>
            <EventSectionHeader event={event} section="participants" />
            {event.readOnly ? (
              <p className="text-muted">{t`Public event. Group membership is not required to participate.`}</p>
            ) : (
              <EventParticipants event={event} actions={a} disabled={q.isPlaceholderData} />
            )}
          </>
        ) : null}
        {tab === "tables" ? (
          <section aria-label={t`Table list`} className="space-y-3">
            <EventSectionHeader event={event} section="tables" />
            <NotificationItem itemId={notificationItemId(event.id, "tables")} />
            <EventTables query={tables} />
          </section>
        ) : null}
        {canManageEvent(event, o.userId) && event.status === "CONFIRMED" && event.canReplan ? (
          <FloatingActions
            label={t`Reopen planning`}
            variant="secondary"
            isDisabled={a.busy || q.isPlaceholderData}
            onPress={() => {
              setError(false);
              transitionVersion.current = event.version;
              setConfirm("replan");
            }}
          >
            <RotateCcw className="size-5" aria-hidden />
          </FloatingActions>
        ) : null}
        {tab === "details" && event.status === "PLANNING" && event.canEdit ? (
          <FloatingActions
            href={`/events/${event.id}/edit${fromGroup === event.groupId ? `?fromGroup=${encodeURIComponent(fromGroup)}` : ""}`}
            label={t`Edit event`}
            isDisabled={a.busy || q.isPlaceholderData}
          >
            <Pencil className="size-5" aria-hidden />
          </FloatingActions>
        ) : null}
        {confirm ? (
          <ContactConfirmDialog
            title={confirm === "confirm" ? t`Confirm event` : t`Reopen planning`}
            description={
              confirm === "confirm"
                ? t`Only agreed tables and accepted players are frozen. Other tables and invitations are retained but excluded.`
                : t`Votes, invitations and waiting priorities are retained. The booking cutoff is not extended. Confirming again discards saved provisional scores.`
            }
            busy={a.busy}
            onCancel={() => setConfirm(null)}
            actions={[
              {
                label: t`Confirm`,
                variant: "primary",
                icon:
                  confirm === "confirm" ? (
                    <CalendarCheck className="size-4" aria-hidden />
                  ) : (
                    <RotateCcw className="size-4" aria-hidden />
                  ),
                onPress: () => void transition(confirm),
              },
            ]}
          >
            {error ? (
              <p
                role="alert"
                className="text-danger"
              >{t`Could not change event state. Refresh and try again.`}</p>
            ) : null}
          </ContactConfirmDialog>
        ) : null}
      </div>
    </NotificationAttentionScope>
  );
}
