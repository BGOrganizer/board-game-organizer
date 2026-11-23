"use client";
import { notificationItemId } from "@board-game-organizer/schemas";
import {
  canManageEvent,
  communityAccessDenied,
  tableItemTargets,
  useEventRecord,
  useNotificationChanges,
  useRecordTable,
} from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, ClipboardPenLine } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { floatingActionContentStyle } from "@/components/common/layout/floatingActionStyles";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import { HEADER_ICON_CLASS, headerControlClassName } from "@/components/common/layout/headerStyles";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationChangesPopover } from "@/components/notifications/NotificationChangesPopover";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDeleteAction } from "./EventDeleteAction";
import { EventTableDetailView } from "./EventTableDetailView";
import { EventTableInfo } from "./EventTableInfo";
import { EventTableOverview } from "./EventTableOverview";
import { EventTableResults } from "./EventTableResults";
export function EventTable({
  eventId,
  tableId,
  context = "personal",
}: {
  eventId: string;
  tableId: string;
  context?: "personal" | "event";
}) {
  const { t, i18n } = useLingui(),
    o = useCommunityApi(),
    q = useRecordTable(o, eventId, tableId),
    event = useEventRecord(o, eventId);
  const params = useSearchParams();
  const invitationItem = notificationItemId(tableId, "invitation", undefined, "table");
  const [tab, setTab] = useState(() =>
    params?.get("tab") === "participants" || params?.get("attention") === invitationItem
      ? "participants"
      : "overview",
  );
  const table =
    communityAccessDenied(q.error) || communityAccessDenied(event.error) ? undefined : q.data;
  const readOnly = Boolean(table?.readOnly || event.data?.readOnly);
  const selected =
    (tab === "results" && table?.eventStatus === "PLANNING") ||
    (tab === "participants" && table?.sharedResultsOnly)
      ? "overview"
      : tab;
  const changes = useNotificationChanges(
    {
      ...o,
      locale: i18n.locale.startsWith("it") ? "it" : "en",
      enabled: o.enabled !== false && Boolean(table) && !readOnly && !table?.sharedResultsOnly,
    },
    {
      kind: "table",
      id: tableId,
      tab: "all",
    },
  );
  const header = (
    <HeaderActions
      back={
        <Link
          href={context === "event" ? `/events/${eventId}` : "/tables"}
          aria-label={t`Back`}
          className={headerControlClassName}
        >
          <ArrowLeft className={HEADER_ICON_CLASS} aria-hidden />
        </Link>
      }
    >
      {table && event.data ? (
        <>
          {!readOnly &&
          canManageEvent(event.data, o.userId) &&
          event.data.status === "CONFIRMED" &&
          event.data.canFinalize &&
          table.eventStatus === "CONFIRMED" &&
          table.confirmed ? (
            <Link
              href={`/events/${eventId}/tables/${tableId}/results`}
              aria-label={t`Register result`}
              aria-disabled={q.isPlaceholderData || event.isPlaceholderData}
              onClick={(e) => {
                if (q.isPlaceholderData || event.isPlaceholderData) e.preventDefault();
              }}
              className="button button--primary button--icon-only size-9 min-h-9 min-w-9"
            >
              <ClipboardPenLine className="size-5" aria-hidden />
            </Link>
          ) : null}
          <EventDeleteAction
            event={event.data}
            table={table}
            disabled={q.isPlaceholderData || event.isPlaceholderData}
          />
        </>
      ) : null}
    </HeaderActions>
  );
  if (!table)
    return (
      <NotificationAttentionScope options={o} targets={[]}>
        <div className="mx-auto w-full max-w-4xl space-y-4">
          {header}
          <EventTableOverview eventId={eventId} tableId={tableId} context={context} />
        </div>
      </NotificationAttentionScope>
    );
  return (
    <NotificationAttentionScope
      options={o}
      targets={
        readOnly
          ? []
          : [
              { kind: "table", id: tableId },
              { kind: "event", id: eventId },
              ...tableItemTargets(table),
            ]
      }
    >
      <div
        className="mx-auto w-full max-w-4xl space-y-4"
        style={
          selected === "participants" && table.canManage && table.eventStatus === "PLANNING"
            ? floatingActionContentStyle
            : undefined
        }
      >
        {header}
        <EventTableDetailView
          table={table}
          info={
            <EventTableInfo
              table={table}
              titleAction={
                !readOnly && !table.sharedResultsOnly ? (
                  <NotificationChangesPopover model={changes} />
                ) : undefined
              }
            />
          }
          selectedKey={selected}
          onSelectionChange={setTab}
          detailsBadge={
            <NotificationTabBadge
              target={{ kind: "table", id: tableId }}
              count={changes.tabCounts.details}
            />
          }
          participantsBadge={
            <NotificationTabBadge
              target={{ kind: "item", id: invitationItem }}
              count={changes.tabCounts.participants}
            />
          }
          details={<EventTableOverview eventId={eventId} tableId={tableId} context={context} />}
          participants={
            <EventTableOverview
              eventId={eventId}
              tableId={tableId}
              context={context}
              section="participants"
            />
          }
          results={<EventTableResults table={table} />}
        />
        {q.isError && selected !== "overview" ? (
          <div role="alert">
            <p>{t`Could not load complete table details`}</p>
            <Button onPress={() => void q.refetch()}>{t`Try again`}</Button>
          </div>
        ) : null}
      </div>
    </NotificationAttentionScope>
  );
}
