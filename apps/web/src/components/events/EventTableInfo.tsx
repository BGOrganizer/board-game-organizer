"use client";

import { notificationItemId, type PlannedTableResponse } from "@board-game-organizer/schemas";
import type { ReactNode } from "react";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { EventTableCardIndicators } from "./EventTableCardIndicators";
import { EventTableInfoView } from "./EventTableInfoView";

export function EventTableInfo({
  table,
  titleAction,
}: {
  table: PlannedTableResponse;
  titleAction?: ReactNode;
}) {
  return (
    <EventTableInfoView
      table={table}
      titleAction={titleAction}
      titleAccessory={
        titleAction ? undefined : (
          <NotificationItem itemId={notificationItemId(table.id, "overview", undefined, "table")} />
        )
      }
      indicators={<EventTableCardIndicators table={table} />}
    />
  );
}
