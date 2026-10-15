"use client";
import type { EventTableResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react/macro";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { EventTableCardBody } from "./EventTableCardBody";

export function EventTableCard({
  table,
  timeZone,
}: {
  table: EventTableResponse;
  timeZone: string;
}) {
  const { t } = useLingui();
  const status =
    table.status === "PLANNING"
      ? null
      : table.status === "CREATED"
        ? t`Confirmed`
        : table.status === "TERMINATED"
          ? t`Finished`
          : t`Cancelled`;
  return (
    <LinkedListCard
      href={`/events/${table.eventId}/tables/${table.id}`}
      label={`${t`Open table`}: ${table.name}`}
    >
      <div className="min-w-0 flex-1 space-y-3">
        <EventTableCardBody
          table={table}
          timeZone={timeZone}
          gameName={table.gameName}
          imageUrl={table.image}
          demonstrator={table.demonstrator}
          confirmedCount={table.confirmedCount}
          reservedCount={table.reservedCount}
        />
        {status ? <p className="text-sm">{status}</p> : null}
      </div>
    </LinkedListCard>
  );
}
