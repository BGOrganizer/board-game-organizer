"use client";
import { useEventTableContext, useEventTableMatch } from "@board-game-organizer/shared";
import { Button, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MatchDetail } from "@/components/matches/MatchDetail";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableEditAction } from "./EventTableEditAction";
import { EventTableHeading } from "./EventTableHeading";
import { EventTableOverview } from "./EventTableOverview";
import { EventTablePlayers } from "./EventTablePlayers";

/** One table view. Match-only results/ratings retain their existing server authorization. */
export function EventTable({ eventId, tableId }: { eventId: string; tableId: string }) {
  const { t } = useLingui();
  const options = useCommunityApi();
  const context = useEventTableContext(options, eventId, tableId);
  const [tab, setTab] = useState("overview");
  const { event, table } = context;
  const match = useEventTableMatch(options, table?.matchId);
  const backHref = `/events/${encodeURIComponent(eventId)}`;
  const back = (
    <Link href={backHref} className="inline-flex min-h-11 items-center gap-2 text-primary">
      <ArrowLeft className="size-5" aria-hidden />
      {t`Back to event`}
    </Link>
  );
  if (!event || !table)
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        {back}
        {context.eventQuery.isPending || (event && context.tableQuery.isPending) ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : (
          <div role="alert">
            <p>{t`Could not load table`}</p>
            <Button
              onPress={() => {
                void context.eventQuery.refetch();
                if (event) void context.tableQuery.refetch();
              }}
            >{t`Retry`}</Button>
          </div>
        )}
      </section>
    );
  if (table.matchId && match.data)
    return <MatchDetail matchId={table.matchId} backHref={backHref} initialTab={tab} />;
  return (
    <section className="mx-auto max-w-3xl space-y-4 pb-28">
      {back}
      {match.error ? (
        <div role="alert">
          <p>{t`Could not load match details`}</p>
          <Button
            onPress={() => {
              void match.refetch();
            }}
          >{t`Retry`}</Button>
        </div>
      ) : null}
      <Tabs
        aria-label={t`Table details`}
        selectedKey={tab}
        onSelectionChange={(key) => setTab(String(key))}
      >
        <Tabs.ListContainer>
          <Tabs.List>
            <Tabs.Tab id="overview">
              {t`Overview`}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="players">
              {t`Players`}
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="overview">
          <div className="space-y-4">
            <EventTableHeading name={table.name} ratingsEnabled={table.openSkill} />
            <EventTableOverview eventId={eventId} tableId={tableId} />
          </div>
        </Tabs.Panel>
        <Tabs.Panel id="players">
          {tab === "players" ? (
            <EventTablePlayers key={`${eventId}/${tableId}`} eventId={eventId} tableId={tableId} />
          ) : null}
        </Tabs.Panel>
      </Tabs>
      <EventTableEditAction eventId={eventId} tableId={tableId} />
    </section>
  );
}
