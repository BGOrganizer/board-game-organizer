"use client";
import {
  communityAccessDenied,
  useEventRecord,
  useRecordTable,
} from "@board-game-organizer/shared";
import { Button, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableLeaderboard } from "./EventTableLeaderboard";
import { EventTableOverview } from "./EventTableOverview";
import { EventTableResults } from "./EventTableResults";
export function EventTable({ eventId, tableId }: { eventId: string; tableId: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    q = useRecordTable(o, eventId, tableId),
    event = useEventRecord(o, eventId);
  const [tab, setTab] = useState("overview");
  const table =
    communityAccessDenied(q.error) || communityAccessDenied(event.error) ? undefined : q.data;
  if (!table || table.eventStatus === "PLANNING")
    return <EventTableOverview eventId={eventId} tableId={tableId} />;
  const selected = tab === "results" && table.eventStatus !== "TERMINATED" ? "overview" : tab;
  return (
    <div className="mx-auto w-full max-w-4xl pb-24">
      <Tabs selectedKey={selected} onSelectionChange={(key) => setTab(String(key))}>
        <Tabs.ListContainer className="mx-auto mb-4 w-fit max-w-full">
          <Tabs.List aria-label={t`Table sections`}>
            <Tabs.Tab id="overview">{t`Overview`}</Tabs.Tab>
            {table.eventStatus === "TERMINATED" ? (
              <Tabs.Tab id="results">{t`Results`}</Tabs.Tab>
            ) : null}
            <Tabs.Tab id="ranking">{t`Ranking`}</Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="overview">
          <EventTableOverview eventId={eventId} tableId={tableId} />
        </Tabs.Panel>
        {table.eventStatus === "TERMINATED" ? (
          <Tabs.Panel id="results">
            <EventTableResults table={table} />
          </Tabs.Panel>
        ) : null}
        <Tabs.Panel id="ranking">
          <EventTableLeaderboard table={table} />
        </Tabs.Panel>
      </Tabs>
      {q.isError && selected !== "overview" ? (
        <div role="alert">
          <p>{t`Could not load complete table details`}</p>
          <Button onPress={() => void q.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
    </div>
  );
}
