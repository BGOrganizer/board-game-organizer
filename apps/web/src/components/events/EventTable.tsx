"use client";
import {
  canManageEvent,
  communityAccessDenied,
  tableItemTargets,
  useEventRecord,
  useRecordTable,
} from "@board-game-organizer/shared";
import { Button, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ChartNoAxesCombined, ClipboardPenLine, Info, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDeleteAction } from "./EventDeleteAction";
import { EventTableLeaderboard } from "./EventTableLeaderboard";
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
  const [tab, setTab] = useState("overview");
  const table =
    communityAccessDenied(q.error) || communityAccessDenied(event.error) ? undefined : q.data;
  const readOnly = Boolean(table?.readOnly || event.data?.readOnly);
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
  if (!table || table.eventStatus === "PLANNING")
    return (
      <NotificationAttentionScope
        options={o}
        targets={
          table && !readOnly
            ? [
                { kind: "table", id: tableId },
                { kind: "event", id: eventId },
                ...tableItemTargets(table),
              ]
            : []
        }
        readOnOpen={table && !readOnly ? { kind: "table", id: tableId } : undefined}
      >
        {header}
        <EventTableOverview eventId={eventId} tableId={tableId} context={context} />
      </NotificationAttentionScope>
    );
  const selected =
    (tab === "results" && table.eventStatus !== "TERMINATED") ||
    (tab === "ranking" && table.sharedResultsOnly)
      ? "overview"
      : tab;
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
      readOnOpen={readOnly ? undefined : { kind: "table", id: tableId }}
    >
      <div className="mx-auto w-full max-w-4xl pb-24">
        {header}
        <Tabs selectedKey={selected} onSelectionChange={(key) => setTab(String(key))}>
          <TabBar label={t`Table sections`}>
            <TabTrigger icon={Info} id="overview">
              {t`Overview`}
              <NotificationTabBadge target={{ kind: "table", id: tableId }} />
            </TabTrigger>
            {table.eventStatus === "TERMINATED" ? (
              <TabTrigger icon={Trophy} id="results">{t`Results`}</TabTrigger>
            ) : null}
            {!table.sharedResultsOnly ? (
              <TabTrigger icon={ChartNoAxesCombined} id="ranking">{t`Ranking`}</TabTrigger>
            ) : null}
          </TabBar>
          <Tabs.Panel id="overview">
            <EventTableOverview eventId={eventId} tableId={tableId} context={context} />
          </Tabs.Panel>
          {table.eventStatus === "TERMINATED" ? (
            <Tabs.Panel id="results">
              <EventTableResults table={table} />
            </Tabs.Panel>
          ) : null}
          {!table.sharedResultsOnly ? (
            <Tabs.Panel id="ranking">
              <EventTableLeaderboard table={table} />
            </Tabs.Panel>
          ) : null}
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
