"use client";
import { notificationItemId } from "@board-game-organizer/schemas";
import {
  canManageEvent,
  communityAccessDenied,
  eventItemTargets,
  useEventRecord,
  useEventRecordActions,
  useNotificationChanges,
  useRecordTables,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, CalendarCheck, Check, Pencil, RotateCcw } from "lucide-react";
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
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationChangesPopover } from "@/components/notifications/NotificationChangesPopover";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useTableTitle } from "@/lib/useTableTitle";

import { EventDeleteAction } from "./EventDeleteAction";
import { EventDetailView } from "./EventDetailView";
import { EventFinalizeAction } from "./EventFinalizeAction";
import { EventGroupLink } from "./EventGroupLink";
import { EventOverview } from "./EventOverview";
import { EventParticipants } from "./EventParticipants";
import { EventProposalSection } from "./EventProposalSection";
import { EventTables } from "./EventTables";
export function EventDetail({ eventId, fromGroup }: { eventId: string; fromGroup?: string }) {
  const { t, i18n } = useLingui(),
    o = useCommunityApi(),
    q = useEventRecord(o, eventId),
    a = useEventRecordActions(o, eventId),
    tables = useRecordTables(o, eventId),
    [confirm, setConfirm] = useState<"confirm" | "replan" | null>(null),
    [error, setError] = useState(false),
    event = communityAccessDenied(q.error) ? undefined : q.data;
  const { getTableTitle, numberedTableTitle } = useTableTitle();
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
                    {event.agreement?.reasons.map((reason) => {
                      const table = tables.items.find((row) => row.id === reason.tableId);
                      return (
                        <p key={reason.tableId}>
                          {table ? getTableTitle(table) : numberedTableTitle()}:{" "}
                          {reason.code === "PENDING_RESERVATIONS"
                            ? t`Pending invitations still reserve places.`
                            : reason.code === "GAME_DISAGREEMENT"
                              ? t`Seated players agree on date and location but not game. Change votes or edit the games; waiting players cannot replace them for this reason.`
                              : t`No compatible accepted players for this table.`}
                        </p>
                      );
                    })}
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
        <EventDetailView
          event={event}
          selectedKey={tab}
          onSelectionChange={setTab}
          titleAction={
            !event.readOnly && !event.personalAccessOnly && !event.sharedResultsOnly ? (
              <NotificationChangesPopover model={changes} />
            ) : undefined
          }
          detailsBadge={
            <NotificationTabBadge
              target={{ kind: "event", id: eventId }}
              count={changes.tabCounts.details}
            />
          }
          participantsBadge={
            <NotificationTabBadge
              target={{ kind: "event", id: eventId }}
              count={changes.tabCounts.participants}
            />
          }
          tablesBadge={
            <NotificationTabBadge
              target={{ kind: "event", id: eventId }}
              count={changes.tabCounts.tables}
            />
          }
          details={
            <EventOverview
              event={event}
              namedVotes={namedVotes}
              busy={a.blocking || q.isPlaceholderData}
              onVote={(kind, optionId, vote) => a.vote.mutate({ kind, optionId, vote })}
              dateProposals={
                <EventProposalSection event={event} kind="date" disabled={q.isPlaceholderData} />
              }
              locationProposals={
                <EventProposalSection
                  event={event}
                  kind="location"
                  disabled={q.isPlaceholderData}
                />
              }
              group={
                event.groupId && fromGroup !== event.groupId ? (
                  <EventGroupLink groupId={event.groupId} name={event.groupName} />
                ) : null
              }
            />
          }
          participants={
            event.readOnly ? (
              <p className="text-muted">{t`Public event. Group membership is not required to participate.`}</p>
            ) : (
              <EventParticipants event={event} actions={a} disabled={q.isPlaceholderData} />
            )
          }
          tables={
            <>
              <NotificationItem itemId={notificationItemId(event.id, "tables")} />
              <EventTables query={tables} />
            </>
          }
        />
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
