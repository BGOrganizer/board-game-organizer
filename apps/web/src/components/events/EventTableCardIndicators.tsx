"use client";

import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableCardIndicatorView } from "./EventTableCardIndicatorView";
import { EventTableGamesPopover } from "./EventTableGamesPopover";

export function EventTableCardIndicators({ table }: { table: PlannedTableResponse }) {
  const { userId } = useCommunityApi();
  return (
    <EventTableCardIndicatorView
      table={table}
      userId={userId}
      renderGames={(props) => <EventTableGamesPopover {...props} />}
    />
  );
}
