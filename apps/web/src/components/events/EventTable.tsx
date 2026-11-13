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
import { Button, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ClipboardPenLine, Info, Trophy, UsersRound } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationChangesPopover } from "@/components/notifications/NotificationChangesPopover";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDeleteAction } from "./EventDeleteAction";
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
  const { t } = useLingui(),
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
      enabled: o.enabled !== false && Boolean(table) && !readOnly && !table?.sharedResultsOnly,
    },
    {
      kind: "table",
      id: tableId,
      tab: "all",
    },
  );
  const header =
    table && event.data ? (
      <HeaderActions>
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
      </HeaderActions>
    ) : null;
  if (!table)
    return (
      <NotificationAttentionScope options={o} targets={[]}>
        {header}
        <EventTableOverview eventId={eventId} tableId={tableId} context={context} />
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
      <div className="mx-auto w-full max-w-4xl pb-24">
        {header}
        <EventTableInfo
          table={table}
          titleAction={
            !readOnly && !table.sharedResultsOnly ? (
              <NotificationChangesPopover model={changes} />
            ) : undefined
          }
        />
        <Tabs selectedKey={selected} onSelectionChange={(key) => setTab(String(key))}>
          <TabBar label={t`Table sections`}>
            <TabTrigger icon={Info} id="overview">
              {t`Details`}
              <NotificationTabBadge
                target={{ kind: "table", id: tableId }}
                count={changes.tabCounts.details}
              />
            </TabTrigger>
            {!table.sharedResultsOnly ? (
              <TabTrigger icon={UsersRound} id="participants">
                {t`Participants`}
                <NotificationTabBadge
                  target={{ kind: "item", id: invitationItem }}
                  count={changes.tabCounts.participants}
                />
              </TabTrigger>
            ) : null}
            {table.eventStatus !== "PLANNING" ? (
              <TabTrigger icon={Trophy} id="results">{t`Results`}</TabTrigger>
            ) : null}
          </TabBar>

          <Tabs.Panel id={selected}>
            {selected === "results" ? (
              <EventTableResults table={table} />
            ) : (
              <EventTableOverview
                eventId={eventId}
                tableId={tableId}
                context={context}
                section={selected === "participants" ? "participants" : "overview"}
              />
            )}
          </Tabs.Panel>
        </Tabs>
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
